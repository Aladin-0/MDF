"""
Recording an audit event. `record()` is the ONE way in (the old `log_activity()` and the orchestrator both go through it).

What can fail and what must not:
* Only the INSERT of the event may raise (an action without its record is exactly what an audit trail must not allow).
* Everything else (the sentence, the device name, hiding secrets, finding the person) degrades to a plain value: it can never
  break the action that is being recorded.
* Rules run AFTER the transaction commits (`transaction.on_commit`), so a rule that fails can never abort a sale.

`safe_record()` is the same inside a savepoint with the failure swallowed AND counted, for call sites that must never stop the
business (sign-in, the old `log_activity` calls). A failure is logged loudly and shows on the Audit settings tab.
"""
import ipaddress
import json
import logging
import os
import re
from decimal import Decimal, InvalidOperation

from django.core.cache import cache
from django.db import transaction

from apps.audit import vocabulary as vocab
from apps.audit.models import ActivityEvent

logger = logging.getLogger(__name__)
fallback_logger = logging.getLogger('audit.fallback')

FAILURE_KEY = 'audit:failed_writes'

# values of these fields are never stored: the event says "changed", not what it changed to
SENSITIVE = ('password', 'token', 'secret', 'api_key', 'apikey', 'authorization', 'credential')   # anywhere in the name
SENSITIVE_WORDS = {'pin', 'otp'}                                                                    # only as a whole word: 'pincode' and 'shipping' are not secrets
HIDDEN = '••• (changed, value not recorded)'


# ───────────────────────────── small pure helpers ─────────────────────────────

def device_label(user_agent: str) -> str:
    """"Chrome on Android": enough to tell one device from another, from the browser's own description."""
    ua = user_agent or ''
    if not ua:
        return ''
    browser = ('Edge' if re.search(r'Edg/', ua) else 'Opera' if re.search(r'OPR/', ua) else 'Chrome' if re.search(r'Chrome/', ua) else
               'Firefox' if 'Firefox/' in ua else 'Safari' if 'Safari/' in ua else 'App' if re.search(r'okhttp|Dart|Expo', ua) else '')
    os_name = ('Android' if 'Android' in ua else 'iPhone' if 'iPhone' in ua else 'iPad' if 'iPad' in ua else 'Windows' if 'Windows' in ua else
               'Mac' if 'Macintosh' in ua else 'Linux' if 'Linux' in ua else '')
    return ' on '.join(x for x in (browser, os_name) if x) or ua[:40]


def _is_private(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private or a.is_loopback
    except ValueError:
        return False


def client_ip(request) -> str:
    """
    The caller's IP. Behind our nginx the direct peer is a private address and nginx puts the real client in `X-Real-IP`
    (set from `$remote_addr`, so a client cannot choose it). `X-Forwarded-For` is NOT used: nginx APPENDS to what the client sent,
    so its first entry can be forged, which made the logged IP (and the "inside the shop network" check) forgeable.
    """
    if request is None:
        return ''
    meta = getattr(request, 'META', {}) or {}
    peer = meta.get('REMOTE_ADDR', '') or ''
    real = (meta.get('HTTP_X_REAL_IP') or '').strip()
    if peer and _is_private(peer) and real:
        return real
    return peer


def inside_network(ip: str, allowed_ips_text: str):
    """True / False against the shop's allowed IP list (Settings > attendance); None when no list is set."""
    allowed = [x.strip() for x in re.split(r'[,\s]+', allowed_ips_text or '') if x.strip()]
    if not allowed or not ip:
        return None
    return ip in allowed


def is_sensitive(name: str) -> bool:
    n = re.sub(r'(?<=[a-z])(?=[A-Z])', '_', name or '').lower().replace(' ', '_').replace('-', '_')   # camelCase -> snake_case
    return any(k in n for k in SENSITIVE) or bool(SENSITIVE_WORDS & set(n.split('_')))


def _jsonable(v, depth=0):
    """Anything -> something JSON can hold (Decimal -> number, UUID / date -> text, nested dicts and lists kept). Never raises."""
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    if depth < 6 and isinstance(v, dict):
        return {str(k): _jsonable(x, depth + 1) for k, x in v.items()}
    if depth < 6 and isinstance(v, (list, tuple, set)):
        return [_jsonable(x, depth + 1) for x in v]
    return str(v)


def label_of(field: str) -> str:
    return field.replace('_', ' ').strip().capitalize()


def normalise_changes(changes):
    """
    Accepts the older {field: {old, new}} dict or a list of {field, before, after}; returns [{field, label, before, after}] with
    secrets hidden. Never raises.
    """
    try:
        out = []
        if isinstance(changes, dict):
            items = [(k, (v or {}).get('old') if isinstance(v, dict) else None, (v or {}).get('new') if isinstance(v, dict) else v) for k, v in changes.items()]
        elif isinstance(changes, (list, tuple)):
            items = [(c.get('field', ''), c.get('before', c.get('old')), c.get('after', c.get('new'))) for c in changes if isinstance(c, dict)]
        else:
            return []
        for field, before, after in items:
            field = str(field)
            hide = is_sensitive(field)
            out.append({'field': field, 'label': label_of(field), 'before': HIDDEN if hide else _jsonable(before), 'after': HIDDEN if hide else _jsonable(after)})
        return out
    except Exception:
        return []


def _to_amount(v):
    if v in (None, ''):
        return None
    try:
        return Decimal(str(v)).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


# ───────────────────────────── who / where ─────────────────────────────

def _actor(actor):
    """(id, name, role, outlet) for whatever we were given (a Staff, an id string, or nothing). Never raises."""
    try:
        from apps.accounts.models import Staff
        if actor is None:
            from apps.audit.core.context import get_audit_context
            actor = get_audit_context().user_id
        if actor is None:
            # the JWT layer fills the context in a real request; when it did not (a session / test login) the request itself knows who is signed in
            user = getattr(_request_from_context(), 'user', None)
            actor = user if getattr(user, 'is_authenticated', False) and hasattr(user, 'pk') else None
        if actor is None:
            return None, '', '', None
        staff = actor if hasattr(actor, 'pk') and hasattr(actor, 'role') else Staff.objects.select_related('outlet').filter(id=actor).first()
        if staff is None:
            return str(actor), '', '', None
        return str(staff.pk), staff.name or staff.phone or '', staff.role or '', getattr(staff, 'outlet', None)
    except Exception:
        return (str(getattr(actor, 'pk', actor)) if actor else None), '', '', None


def _where(request):
    ip = client_ip(request)
    ua = ''
    try:
        ua = (request.META.get('HTTP_USER_AGENT') or '')[:1000] if request is not None else ''
    except Exception:
        pass
    return ip, ua


def _request_from_context():
    try:
        from apps.audit.middleware import get_audit_context as v1
        return (v1() or {}).get('request')
    except Exception:
        return None


# ───────────────────────────── the one way in ─────────────────────────────

def record(code, *, actor=None, outlet=None, entity=None, entity_type='', entity_id='', entity_label='', summary='', changes=None, amount=None,
           reason='', reason_code='', metadata=None, severity=None, module='', action='', request=None, source='web', ctx=None, actor_type='human'):
    """
    Write one event now (inside the caller's transaction) and return it. `ctx` adds words for the sentence template (count, from_, to...).
    Only the insert can raise.
    """
    spec = vocab.spec_of(code)
    request = request if request is not None else _request_from_context()
    actor_id, actor_name, actor_role, actor_outlet = _actor(actor)
    outlet_obj = outlet if outlet is not None else actor_outlet
    outlet_id = str(outlet_obj.pk) if getattr(outlet_obj, 'pk', None) else (str(outlet) if isinstance(outlet, str) else None)
    outlet_name = getattr(outlet_obj, 'name', '') or ''

    if entity is not None:
        entity_type = entity_type or entity.__class__.__name__
        entity_id = entity_id or (str(entity.pk) if getattr(entity, 'pk', None) else '')
        entity_label = entity_label or _label(entity)
    ip, ua = _where(request)
    device = device_label(ua)
    net = None
    try:
        if ip and outlet_id:
            from apps.core.models import OutletSettings
            net = inside_network(ip, OutletSettings.objects.filter(outlet_id=outlet_id).values_list('allowed_attendance_ips', flat=True).first() or '')
    except Exception:
        net = None

    sentence = summary
    if not sentence:
        words = dict(ctx or {})
        words.update(actor=actor_name or ('System' if not actor_id else 'Someone'), entity=entity_label or entity_type, amount=amount, reason=reason, device=device, label=getattr(spec, 'label', ''))
        try:
            sentence = vocab.render(code, words)
        except Exception:          # a template bug must never stop the record: say it plainly instead
            logger.exception('audit sentence failed for %s', code)
            sentence = f"{words['actor']}: {getattr(spec, 'label', '') or code} {entity_label or entity_type}".strip()

    from apps.audit.core.context import get_audit_context
    c = get_audit_context()
    meta = dict(metadata or {})
    if request is not None and getattr(request, 'method', None):
        meta.setdefault('endpoint', str(getattr(request, 'path', ''))[:300])
        meta.setdefault('method', request.method)
    return ActivityEvent.objects.create(
        tenant_id=outlet_id, actor_id=actor_id, actor_type=actor_type, actor_name=actor_name[:255], actor_role=actor_role[:50], outlet_name=outlet_name[:255],
        request_id=(getattr(c, 'request_id', None) or None), session_id=getattr(c, 'session_id', None), ip_address=ip or None, user_agent=ua, device=device[:160],
        inside_network=net, source=source,
        action=action or (spec.label if spec else code) or 'event', module=module or (spec.module if spec else '') or 'other', code=code or '',
        category=vocab.category_of(code, module), entity_type=entity_type or '', entity_id=entity_id or '', entity_label=(entity_label or '')[:255],
        summary=sentence, changes_json=normalise_changes(changes), amount=_to_amount(amount), reason_code=reason_code or '', reason_text=reason or '',
        metadata_json=_jsonable(meta), severity=severity or (spec.severity if spec else 'info'),
    )


def _label(entity) -> str:
    for attr in ('invoice_no', 'return_no', 'voucher_no', 'debit_note_no', 'batch_no', 'name'):
        v = getattr(entity, attr, None)
        if v:
            return str(v)
    return str(entity)[:250]


def after_commit(event):
    """Run the rules for this event once the surrounding transaction has committed; a failing rule can never undo a sale."""
    def _go():
        try:
            from apps.audit import rules
            rules.evaluate_event(event.pk)
        except Exception:
            logger.exception('audit rules failed for event %s', event.pk)
    transaction.on_commit(_go)


def _count_failure(exc, payload):
    try:
        cache.set(FAILURE_KEY, int(cache.get(FAILURE_KEY) or 0) + 1, None)
    except Exception:
        pass
    logger.error('AUDIT WRITE FAILED: %s', exc, exc_info=True)
    try:
        os.makedirs('/app/logs', exist_ok=True)
        fallback_logger.error(json.dumps({k: str(v)[:300] for k, v in payload.items()}))
    except Exception:
        pass


def safe_record(code, **kwargs):
    """`record()` that can never stop the business: a savepoint, the failure counted and logged loudly. Returns the event or None."""
    try:
        with transaction.atomic():
            ev = record(code, **kwargs)
        after_commit(ev)
        return ev
    except Exception as exc:
        _count_failure(exc, {'code': code, **{k: v for k, v in kwargs.items() if k in ('entity_label', 'summary', 'module', 'action')}})
        return None


def failed_writes() -> int:
    try:
        return int(cache.get(FAILURE_KEY) or 0)
    except Exception:
        return 0
