"""
Staff counter PIN: the one place that checks a PIN, finds whose it is, and sets it.

`Staff.staff_pin` stays the truth: a password hash that is slow on purpose (about half a second per check).
"Whose PIN is 1234?" used to run that slow check once for every staff member of the outlet, so the wait at
the billing counter grew with the size of the team.

`Staff.pin_lookup` is a *receipt* for a check that has already passed. It is written only when the PIN is set
or right after the slow check succeeded, and it lets the same PIN be recognised again in microseconds:

    receipt = <tag of the current hash> $ HMAC(server key, current hash + PIN)

What that buys, and what it does not give away:

* A copy of the database alone cannot be used to test PIN guesses against a receipt: the key is derived from
  SECRET_KEY, which is not in the database.
* A receipt is tied to the hash it was made for. Change the PIN by any route (this module, the Django admin,
  a script) and the old receipt stops matching at once: an old PIN can never keep working.
* No receipt yet (PIN set before this column existed), or a new SECRET_KEY: the staff member simply gets the
  slow check once more, and a fresh receipt is written when it passes.

Guessing is limited by `PIN_USER_LIMITER`, not by the cost of the hash: every view that accepts a PIN must
call `pin_blocked_response` first and `PIN_USER_LIMITER.record_failure` on a wrong one.
"""
from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework import status
from rest_framework.response import Response

from apps.core.ratelimit import FailureLimiter

# PIN guessing by an already logged-in user (cashier switch on the billing terminal, stock adjustment).
PIN_USER_LIMITER = FailureLimiter('pin:user', limit=10, window=5 * 60)

_KEY_SALT = 'mediflow.accounts.staff-pin'
_SEP = '\x1f'   # cannot appear in a hash or in a PIN, so the joined parts cannot be confused with each other

# The slow check's answer is remembered so the same question is not hashed twice. A wrong pair stays wrong
# until the PIN changes (the hash is part of the key), so it can be kept much longer than a right one.
_RIGHT_TTL = 60 * 60
_WRONG_TTL = 7 * 24 * 60 * 60


def _mac(purpose, *parts):
    return salted_hmac(_KEY_SALT, _SEP.join((purpose,) + parts), algorithm='sha256').hexdigest()


def _tag(pin_hash):
    """Which hash (and which server key) a receipt belongs to."""
    return _mac('tag', pin_hash)[:16]


def make_receipt(pin_hash, pin):
    """The value to store in `pin_lookup` for a PIN that is known to match `pin_hash`."""
    return f'{_tag(pin_hash)}${_mac("pin", pin_hash, str(pin))}'


def _slow_check(pin_hash, pin):
    key = 'pin_check:' + _mac('cache', pin_hash, pin)[:40]   # keyed digest: neither the PIN nor the hash is readable from it
    known = cache.get(key)
    if known is None:
        known = bool(check_password(pin, pin_hash))
        cache.set(key, known, timeout=_RIGHT_TTL if known else _WRONG_TTL)
    return known


def pin_matches(staff, pin):
    """True if `pin` is this staff member's PIN."""
    pin = '' if pin is None else str(pin)
    pin_hash = staff.staff_pin or ''
    if not pin or not pin_hash:
        return False

    tag, _, mac = (getattr(staff, 'pin_lookup', '') or '').partition('$')
    if mac and constant_time_compare(tag, _tag(pin_hash)):
        # A receipt for exactly this hash: it answers for every PIN, right or wrong, without the slow check.
        return constant_time_compare(mac, _mac('pin', pin_hash, pin))

    if not _slow_check(pin_hash, pin):
        return False
    # Passed the slow check: leave a receipt so the next time is instant. A plain UPDATE (no save(), no audit
    # row), and only if the PIN was not changed by someone else in the meantime.
    receipt = make_receipt(pin_hash, pin)
    type(staff).objects.filter(pk=staff.pk, staff_pin=pin_hash).update(pin_lookup=receipt)
    staff.pin_lookup = receipt
    return True


def staff_with_pin(outlet, pin, exclude_id=None):
    """Every active staff member of the outlet whose PIN is `pin` (normally none or one)."""
    from apps.accounts.models import Staff
    staff = Staff.objects.filter(outlet=outlet, is_active=True)
    if exclude_id is not None:
        staff = staff.exclude(id=exclude_id)
    return [s for s in staff if pin_matches(s, pin)]


def hashed_pin_fields(raw_pin):
    """`{'staff_pin': ..., 'pin_lookup': ...}` for a new PIN: always set the two together."""
    pin_hash = make_password(str(raw_pin))
    return {'staff_pin': pin_hash, 'pin_lookup': make_receipt(pin_hash, raw_pin)}


def set_pin(staff, raw_pin):
    """Give the staff member a new PIN (does not save)."""
    for field, value in hashed_pin_fields(raw_pin).items():
        setattr(staff, field, value)


def pin_blocked_response(user):
    """429 response when this logged-in user has made too many wrong PIN guesses, else None."""
    wait = PIN_USER_LIMITER.blocked_for(user.id)
    if not wait:
        return None
    response = Response(
        {'error': {'code': 'TOO_MANY_ATTEMPTS',
                   'message': f'Too many wrong PIN attempts. Try again in {max(wait // 60, 1)} minute(s).'}},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )
    response['Retry-After'] = str(wait)
    return response
