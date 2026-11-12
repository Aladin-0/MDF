"""
Cache keys for the inventory list.

The list view caches each page for 2 minutes. It used to be invalidated after a stock adjustment
with `cache.delete_pattern(...)`, which only exists in the django-redis package. This project uses
Django's built-in Redis cache, so the call raised, the bare `except: pass` swallowed it, and the
list kept showing the old stock for up to two minutes after an adjustment (it looked as if the
adjustment had not worked).

Instead of deleting keys by pattern (not supported), every key carries a version number. Bumping
the version makes all older keys unreachable; they simply expire.
"""
from django.core.cache import cache

_VERSION_TTL = None  # never expires: losing it would only make stale keys reachable again


def _key(outlet_id) -> str:
    return f'inventory:ver:{outlet_id or "all"}'


def inventory_cache_version(outlet_id) -> str:
    """Changes whenever stock for this outlet (or, with `bump_inventory_cache()`, for everyone) changed."""
    return f"{cache.get(_key(None)) or 1}.{cache.get(_key(outlet_id)) or 1}"


def bump_inventory_cache(outlet_id=None) -> None:
    """Make every cached inventory page of this outlet (or of all outlets when None) stale."""
    key = _key(outlet_id)
    try:
        cache.incr(key)
    except ValueError:  # key not set yet
        cache.set(key, 2, _VERSION_TTL)
