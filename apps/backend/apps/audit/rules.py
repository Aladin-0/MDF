"""
Suspicious-behaviour rules. Every rule is plain and explainable: it reads events already in the trail, and when it fires it says WHY in a
sentence, links its evidence, and waits for a person to review it. Nothing here proves wrongdoing: it points a finger at things worth a look.

* Single-event rules run right after the event is committed (`recorder.after_commit`); per-person "how many today" rules do the same for that
  person only, so there is no scheduler to forget to run.
* One flag per rule + person + day (a spike is ONE flag that grows, not fifty).
* Thresholds and on/off live in `AuditPolicy.rules_json` (Audit settings); the defaults here were chosen for a small pharmacy.
* `dry_run()` runs the rules over history WITHOUT writing flags, so thresholds can be tuned on real data before anyone is alerted.
"""
import logging
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from apps.audit import policy as pol
from apps.audit.models import ActivityEvent, AuditFlag
from apps.audit.vocabulary import money

logger = logging.getLogger(__name__)

SEVERITY_ORDER = {'info': 0, 'notice': 1, 'warning': 2, 'critical': 3}

PAID_CHANGE = ('bill.corrected_after_payment', 'bill.cancelled', 'bill.reissued')
CANCELS = ('bill.cancelled', 'bill.reissued')


@dataclass
class FlagSpec:
    rule: str
    severity: str
    title: str
    why: str
    evidence: dict = field(default_factory=dict)
    actor_id: str = ''
    actor_name: str = ''
    key: str = ''           # dedupe


# the built-in defaults: title shown in Settings, why it matters, and the thresholds
RULES = {
    'paid_bill_changes': {'title': 'Paid bills changed or cancelled', 'why': 'Changing a bill after the customer has paid is the usual way money goes missing.', 'enabled': True, 'threshold': 3, 'high_value': 5000},
    'bill_cancel_spike': {'title': 'Many cancellations by one person', 'why': 'A cancelled (or cancelled and re-issued) bill removes a sale. Several in a day, well above what this person usually does, is worth checking.', 'enabled': True, 'threshold': 3},
    'backdated_bill': {'title': 'Back-dated bill', 'why': 'A bill dated earlier than the day it was entered can move sales between days or hide them from a closed day.', 'enabled': True, 'threshold': 3},
    'big_discount': {'title': 'Big discount', 'why': 'Large manual discounts are how goods are given away to friends and family.', 'enabled': True, 'threshold': 15},
    'bulk_writeoff': {'title': 'Big or unusual stock write-off', 'why': 'Stock written off disappears from the shelf and from profit. Large amounts, items that have not expired, or night-time removals need a reason.', 'enabled': True, 'threshold': 10000, 'count': 20},
    'staff_access_change': {'title': 'Staff or access change', 'why': 'A new admin, a higher role or a changed PIN gives someone more power. It should be expected.', 'enabled': True},
    'credit_limit_raised': {'title': 'Credit limit raised sharply', 'why': 'A higher limit lets more goods leave unpaid.', 'enabled': True, 'threshold': 10000},
    'settings_changed': {'title': 'Important settings changed', 'why': 'Tax, messaging keys and the shop-network list control what the system allows.', 'enabled': True},
    'failed_logins': {'title': 'Repeated failed sign-ins', 'why': 'Several wrong passwords in a short time can be someone guessing.', 'enabled': True, 'threshold': 5, 'minutes': 10},
    'new_device': {'title': 'Sign-in from a new device', 'why': 'A person signing in from a phone or computer they have not used before.', 'enabled': True},
    'after_hours_outside': {'title': 'Sign-in outside hours and outside the shop', 'why': 'Out of working hours and not on the shop network. (Only when both are true, to avoid noise.)', 'enabled': True},
    'big_export': {'title': 'Large data export', 'why': 'Customer, sales or audit data leaving the system in bulk.', 'enabled': True, 'threshold': 500},
}


def _policy_for(event):
    return pol.get_policy(pol.org_of_outlet(event.tenant_id))


def _cfg(policy, code):
    return pol.rule_setting(policy, code, RULES[code])


def _local_day(dt):
    # the project stores naive local (IST) datetimes (USE_TZ = False), so there is nothing to convert
    return dt.date()


def _name(e):
    return e.actor_name or 'Someone'


def _usual(actor_id, codes, today, days=30):
    """The person's typical count per day over the last `days` days (median of the days they did any), excluding today."""
    since = timezone.now() - timedelta(days=days)
    by_day = {}
    for t in ActivityEvent.objects.filter(actor_id=actor_id, code__in=codes, occurred_at__gte=since).values_list('occurred_at', flat=True):
        d = _local_day(t)
        if d != today:
            by_day[d] = by_day.get(d, 0) + 1
    return statistics.median(by_day.values()) if by_day else 0


def _count_today(actor_id, codes, day, paid_only=False):
    start = datetime.combine(day, datetime.min.time())
    qs = ActivityEvent.objects.filter(actor_id=actor_id, code__in=codes, occurred_at__gte=start, occurred_at__lt=start + timedelta(days=1))
    return (qs.filter(metadata_json__was_paid=True) if paid_only else qs).count()


# ───────────────────────────── the rules: each returns a FlagSpec or None ─────────────────────────────

def r_paid_bill_changes(e, policy):
    cfg = _cfg(policy, 'paid_bill_changes')
    if e.code not in PAID_CHANGE or not e.actor_id or not e.metadata_json.get('was_paid', False):
        return None
    day = _local_day(e.occurred_at)
    n = _count_today(e.actor_id, PAID_CHANGE, day, paid_only=True)
    usual = _usual(e.actor_id, PAID_CHANGE, day)
    big = e.amount is not None and float(e.amount) >= cfg['high_value']
    if n < cfg['threshold'] and not big:
        return None
    sev = 'critical' if n >= cfg['threshold'] * 3 else 'warning'
    if (n >= cfg['threshold'] and n > 2 * usual) or big:
        title = (f"{_name(e)} changed or cancelled {n} paid bills today (usual: {int(usual)})" if n >= cfg['threshold'] else
                 f"{_name(e)} changed a paid bill of {money(e.amount)} ({e.entity_label})")
        return FlagSpec('paid_bill_changes', sev if n >= cfg['threshold'] else 'notice', title, RULES['paid_bill_changes']['why'],
                        {'count_today': n, 'usual_per_day': usual, 'latest_bill': e.entity_label}, e.actor_id, _name(e), f'paid_bill_changes:{e.actor_id}:{day}' if n >= cfg['threshold'] else f'paid_bill_changes:{e.id}')
    return None


def r_bill_cancel_spike(e, policy):
    cfg = _cfg(policy, 'bill_cancel_spike')
    if e.code not in CANCELS or not e.actor_id:
        return None
    day = _local_day(e.occurred_at)
    n = _count_today(e.actor_id, CANCELS, day)
    usual = _usual(e.actor_id, CANCELS, day)
    if n < cfg['threshold'] or n <= 2 * usual:
        return None
    return FlagSpec('bill_cancel_spike', 'critical' if n >= cfg['threshold'] * 3 else 'warning', f"{_name(e)} cancelled {n} bills today (usual: {int(usual)})",
                    RULES['bill_cancel_spike']['why'], {'count_today': n, 'usual_per_day': usual}, e.actor_id, _name(e), f'bill_cancel_spike:{e.actor_id}:{day}')


def r_backdated_bill(e, policy):
    cfg = _cfg(policy, 'backdated_bill')
    days_back = e.metadata_json.get('days_back')
    if e.code != 'bill.created' or not isinstance(days_back, (int, float)) or days_back < cfg['threshold']:
        return None
    return FlagSpec('backdated_bill', 'notice', f"Bill {e.entity_label} is dated {int(days_back)} days ago but was entered today", RULES['backdated_bill']['why'],
                    {'days_back': days_back, 'bill': e.entity_label}, e.actor_id or '', _name(e), f'backdated_bill:{e.id}')


def r_big_discount(e, policy):
    cfg = _cfg(policy, 'big_discount')
    pct = e.metadata_json.get('discount_pct')
    if e.code != 'bill.created' or not isinstance(pct, (int, float)):
        return None
    limit = e.metadata_json.get('staff_max_discount')
    over_limit = isinstance(limit, (int, float)) and limit > 0 and pct > limit
    if pct < cfg['threshold'] and not over_limit:
        return None
    why = f"{_name(e)} gave a {pct:g}% discount on bill {e.entity_label}" + (f" ({money(e.amount)})" if e.amount else '') + (f"; their limit is {limit:g}%" if over_limit else '')
    return FlagSpec('big_discount', 'warning' if over_limit else 'notice', why, RULES['big_discount']['why'], {'discount_pct': pct, 'limit': limit, 'bill': e.entity_label},
                    e.actor_id or '', _name(e), f'big_discount:{e.id}')


def r_bulk_writeoff(e, policy):
    cfg = _cfg(policy, 'bulk_writeoff')
    if e.code not in ('stock.bulk_written_off', 'stock.adjusted'):
        return None
    meta = e.metadata_json
    value = float(meta.get('value') or e.amount or 0)
    count = int(meta.get('count') or 1)
    not_expired = int(meta.get('not_expired') or 0)
    local = e.occurred_at
    night = local.hour < 6 or local.hour >= 23
    reasons = []
    if value >= cfg['threshold']:
        reasons.append(f'worth {money(value)}')
    if count >= cfg['count']:
        reasons.append(f'{count} batches')
    if not_expired > 0 and e.code != 'stock.adjusted':
        reasons.append(f'{not_expired} not yet expired')
    if night and (value >= cfg['threshold'] / 2 or count > 1):
        reasons.append('at night')
    if not reasons:
        return None
    sev = 'critical' if value >= cfg['threshold'] * 5 or (not_expired > 0 and value >= cfg['threshold']) else 'warning'
    when = local.strftime('%-d %b, %-I:%M %p')
    return FlagSpec('bulk_writeoff', sev, f"{_name(e)} removed {count} batch{'es' if count != 1 else ''} from stock ({', '.join(reasons)}) on {when}", RULES['bulk_writeoff']['why'],
                    {'value': value, 'count': count, 'not_expired': not_expired, 'at_night': night}, e.actor_id or '', _name(e), f'bulk_writeoff:{e.id}')


def r_staff_access_change(e, policy):
    meta = e.metadata_json
    high = meta.get('role_to') in ('admin', 'super_admin') or meta.get('target_role') in ('admin', 'super_admin')
    if e.code == 'staff.created' and high:
        sev, text = 'warning', f"{_name(e)} added {e.entity_label} as {meta.get('target_role') or meta.get('role_to')}"
    elif e.code == 'staff.role_changed':
        sev, text = ('critical' if high else 'warning'), f"{_name(e)} changed the role of {e.entity_label} from {meta.get('role_from', '…')} to {meta.get('role_to', '…')}"
    elif e.code == 'staff.pin_changed' and meta.get('target_id') and meta.get('target_id') != e.actor_id:
        sev, text = 'notice', f"{_name(e)} changed the {meta.get('what', 'PIN')} of {e.entity_label}"
    elif e.code == 'staff.reactivated':
        sev, text = 'warning', f"{_name(e)} reactivated {e.entity_label}"
    else:
        return None
    return FlagSpec('staff_access_change', sev, text, RULES['staff_access_change']['why'], {'role_from': meta.get('role_from'), 'role_to': meta.get('role_to')}, e.actor_id or '', _name(e), f'staff_access_change:{e.id}')


def r_credit_limit_raised(e, policy):
    cfg = _cfg(policy, 'credit_limit_raised')
    if e.code != 'credit_limit.changed':
        return None
    old, new = e.metadata_json.get('from'), e.metadata_json.get('to')
    if not isinstance(old, (int, float)) or not isinstance(new, (int, float)) or new <= old:
        return None
    if new < old * 2 and (new - old) < cfg['threshold']:
        return None
    return FlagSpec('credit_limit_raised', 'warning', f"{_name(e)} raised the credit limit of {e.entity_label} from {money(old)} to {money(new)}", RULES['credit_limit_raised']['why'],
                    {'from': old, 'to': new}, e.actor_id or '', _name(e), f'credit_limit_raised:{e.id}')


def r_settings_changed(e, policy):
    if e.code == 'settings.secret_changed':
        return FlagSpec('settings_changed', 'warning', e.summary, RULES['settings_changed']['why'], {'fields': e.metadata_json.get('fields')}, e.actor_id or '', _name(e), f'settings_changed:{e.id}')
    if e.code == 'settings.changed' and e.metadata_json.get('sensitive'):
        return FlagSpec('settings_changed', 'notice', e.summary, RULES['settings_changed']['why'], {'fields': e.metadata_json.get('fields')}, e.actor_id or '', _name(e), f'settings_changed:{e.id}')
    return None


def r_failed_logins(e, policy):
    cfg = _cfg(policy, 'failed_logins')
    if e.code != 'login.failed':
        return None
    since = e.occurred_at - timedelta(minutes=cfg['minutes'])
    who = e.entity_label or e.metadata_json.get('phone_masked') or ''
    qs = ActivityEvent.objects.filter(code='login.failed', occurred_at__gte=since, occurred_at__lte=e.occurred_at)
    n = qs.filter(entity_label=who).count() if who else qs.filter(ip_address=e.ip_address).count()
    if n < cfg['threshold']:
        return None
    return FlagSpec('failed_logins', 'warning', f"{n} failed sign-ins for {who or 'one address'} in {cfg['minutes']} minutes", RULES['failed_logins']['why'],
                    {'attempts': n, 'ip': e.ip_address}, '', who, f"failed_logins:{who or e.ip_address}:{_local_day(e.occurred_at)}:{e.occurred_at.hour}")


def r_new_device(e, policy):
    if e.code != 'login.succeeded' or not e.actor_id or not e.device:
        return None
    earlier = ActivityEvent.objects.filter(actor_id=e.actor_id, code='login.succeeded', occurred_at__lt=e.occurred_at, occurred_at__gte=e.occurred_at - timedelta(days=90))
    if not earlier.exists() or earlier.filter(device=e.device).exists():
        return None                       # their first sign-in on record, or a device they have used
    return FlagSpec('new_device', 'notice', f"{_name(e)} signed in from a new device ({e.device})", RULES['new_device']['why'], {'device': e.device, 'ip': e.ip_address},
                    e.actor_id, _name(e), f'new_device:{e.actor_id}:{e.device}')


def r_after_hours_outside(e, policy):
    if e.code != 'login.succeeded' or e.inside_network is not False:
        return None
    try:
        from apps.core.models import OutletSettings
        st = OutletSettings.objects.filter(outlet_id=e.tenant_id).first()
        opening, closing = (st.opening_time, st.closing_time) if st else (None, None)
    except Exception:
        opening = closing = None
    if not opening or not closing:
        return None
    t = e.occurred_at.time()
    margin = timedelta(hours=1)
    lo = (datetime.combine(datetime.today(), opening) - margin).time()
    hi = (datetime.combine(datetime.today(), closing) + margin).time()
    if lo <= t <= hi:
        return None
    return FlagSpec('after_hours_outside', 'notice', f"{_name(e)} signed in at {t.strftime('%-I:%M %p')}, outside working hours and away from the shop network", RULES['after_hours_outside']['why'],
                    {'time': t.isoformat(timespec='minutes'), 'ip': e.ip_address}, e.actor_id or '', _name(e), f'after_hours_outside:{e.id}')


def r_big_export(e, policy):
    cfg = _cfg(policy, 'big_export')
    rows = e.metadata_json.get('rows')
    if e.code == 'audit.exported' or (e.code == 'data.exported' and isinstance(rows, (int, float)) and rows >= cfg['threshold']):
        return FlagSpec('big_export', 'notice', e.summary, RULES['big_export']['why'], {'rows': rows}, e.actor_id or '', _name(e), f'big_export:{e.id}')
    return None


RULE_FUNCS = [r_paid_bill_changes, r_bill_cancel_spike, r_backdated_bill, r_big_discount, r_bulk_writeoff, r_staff_access_change, r_credit_limit_raised,
              r_settings_changed, r_failed_logins, r_new_device, r_after_hours_outside, r_big_export]
_RULE_OF = {f: f.__name__[2:] for f in RULE_FUNCS}


def _specs(event, policy):
    out = []
    for fn in RULE_FUNCS:
        code = _RULE_OF[fn]
        if not _cfg(policy, code).get('enabled', True):
            continue
        try:
            spec = fn(event, policy)
        except Exception:
            logger.exception('audit rule %s failed on event %s', code, event.pk)
            continue
        if spec:
            out.append(spec)
    return out


def _upsert(event, spec):
    flag = AuditFlag.objects.filter(dedupe_key=spec.key).first()
    if flag:
        if flag.status == 'new':       # a spike grows: keep the same flag, update its count and wording
            flag.title, flag.evidence_json, flag.severity = spec.title, spec.evidence, max(flag.severity, spec.severity, key=lambda s: SEVERITY_ORDER.get(s, 0))
            flag.save(update_fields=['title', 'evidence_json', 'severity'])
        return flag, False
    flag = AuditFlag.objects.create(event=event, tenant_id=event.tenant_id, rule_code=spec.rule, severity=spec.severity, title=spec.title, why=spec.why, evidence_json=spec.evidence,
                                    subject_actor_id=spec.actor_id, subject_name=spec.actor_name, dedupe_key=spec.key)
    return flag, True


def evaluate_event(event_id):
    """Run every rule on one committed event; write the flags; count them on the event. Also (about once a day) the retention purge."""
    event = ActivityEvent.objects.filter(pk=event_id).first()
    if event is None:
        return []
    policy = _policy_for(event)
    made = []
    with transaction.atomic():
        for spec in _specs(event, policy):
            flag, created = _upsert(event, spec)
            if created:
                made.append(flag)
        if made:
            top = max((f.severity for f in made), key=lambda s: SEVERITY_ORDER.get(s, 0))
            ActivityEvent.objects.filter(pk=event.pk).update(flag_count=event.flags.count(),
                                                             severity=top if SEVERITY_ORDER.get(top, 0) > SEVERITY_ORDER.get(event.severity, 0) else event.severity)
    pol.maybe_purge()
    return made


def dry_run(events=None, limit=5000):
    """Run the rules over history and RETURN what would be flagged (nothing is written). For tuning thresholds on real data first."""
    qs = events if events is not None else ActivityEvent.objects.order_by('occurred_at')[:limit]
    out = []
    for e in qs:
        for spec in _specs(e, _policy_for(e)):
            out.append({'event': str(e.id), 'when': e.occurred_at.isoformat(), 'rule': spec.rule, 'severity': spec.severity, 'title': spec.title})
    return out
