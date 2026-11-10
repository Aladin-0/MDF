"""
Tiny failure-counting rate limiter on top of Django's cache (Redis in production, so the
counters are shared by all gunicorn workers).

Used to stop brute-forcing of logins and of the 4-digit staff PINs, which have only 10,000
possible values and used to be guessable with no limit at all.

    limiter = FailureLimiter('login:phone', limit=5, window=15 * 60)
    wait = limiter.blocked_for(phone)        # seconds to wait, or 0 when not blocked
    ...wrong credentials...
    limiter.record_failure(phone)
    ...right credentials...
    limiter.reset(phone)
"""
import hashlib
import time

from django.core.cache import cache


def _digest(identity):
    """Short, fixed-size cache key part: never put raw phones/PINs/emails into cache keys."""
    return hashlib.sha256(str(identity).encode('utf-8')).hexdigest()[:32]


class FailureLimiter:
    def __init__(self, scope, limit, window):
        self.scope = scope
        self.limit = limit
        self.window = window  # seconds

    def _key(self, identity):
        return f'rl:{self.scope}:{_digest(identity)}'

    def _state(self, identity):
        """(failures, window_started_at) or (0, None)."""
        return cache.get(self._key(identity)) or (0, None)

    def blocked_for(self, identity):
        """Seconds until the caller may try again; 0 when not blocked."""
        failures, started = self._state(identity)
        if started is None or failures < self.limit:
            return 0
        remaining = int(started + self.window - time.time())
        return max(remaining, 0)

    def record_failure(self, identity):
        failures, started = self._state(identity)
        now = time.time()
        if started is None or now - started >= self.window:
            failures, started = 0, now
        failures += 1
        # keep the entry only as long as the window lasts
        ttl = max(int(started + self.window - now), 1)
        cache.set(self._key(identity), (failures, started), timeout=ttl)
        return failures

    def reset(self, identity):
        cache.delete(self._key(identity))


def client_ip(request):
    """Best-effort client IP (first hop of X-Forwarded-For when behind the nginx proxy)."""
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '') or 'unknown'
