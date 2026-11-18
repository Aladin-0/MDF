"""Audit settings per organisation: how long to keep the trail, and which rules are on at what threshold. Plus the retention purge."""
from datetime import timedelta
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from apps.audit.models import ActivityEvent, ActivityLog, AuditFlag, AuditPolicy

DEFAULT_RETENTION_DAYS = 365
MIN_RETENTION_DAYS = 30            # a typo (3 instead of 365) must not be able to wipe the trail
PURGE_EVERY = timedelta(hours=20)  # at most about once a day, started by event writes (no scheduler to forget to run)
PURGE_BATCH = 2000


def org_of_outlet(outlet_id):
    if not outlet_id:
        return None
    from apps.core.models import Outlet
    return Outlet.objects.filter(id=outlet_id).values_list('organization_id', flat=True).first()


def get_policy(org_id) -> AuditPolicy:
    row, _ = AuditPolicy.objects.get_or_create(organization_id=str(org_id) if org_id else 'default', defaults={'retention_days': DEFAULT_RETENTION_DAYS})
    return row


def rule_setting(policy, rule_code: str, defaults: dict) -> dict:
    """The rule's switch and threshold: the organisation's override on top of the built-in default."""
    cfg = dict(defaults)
    cfg.update((policy.rules_json or {}).get(rule_code, {}) if policy else {})
    return cfg


def cutoff(days: int):
    return timezone.now() - timedelta(days=max(days, MIN_RETENTION_DAYS))


def _allow_purge(cursor):
    # the append-only trigger (migration 0010) lets a row go only when the purge says so
    if connection.vendor == 'postgresql':
        cursor.execute("SET LOCAL audit.allow_purge = 'on'")


def purge(*, dry_run=True, now=None, record=True) -> dict:
    """
    Remove audit rows older than each organisation's retention (default 365 days). Dry run unless told otherwise.
    Scope: ActivityEvent (+ its flags) and the old ActivityLog. NOT DocumentRevisionV2: bill and purchase revision numbers and the
    cancel / re-issue link live there, and the bill-history screens read it.
    """
    from apps.core.models import Organization, Outlet
    now = now or timezone.now()
    removed = {'events': 0, 'flags': 0, 'old_log': 0}
    plan = []
    for org in Organization.objects.all():
        pol = get_policy(org.id)
        plan.append((pol, [str(o) for o in Outlet.objects.filter(organization=org).values_list('id', flat=True)]))
    default_pol = get_policy(None)
    all_outlets = {o for _, outs in plan for o in outs}
    for pol, outlets in plan + [(default_pol, None)]:
        limit = now - timedelta(days=max(pol.retention_days, MIN_RETENTION_DAYS))
        ev = ActivityEvent.objects.filter(occurred_at__lt=limit)
        lg = ActivityLog.objects.filter(timestamp__lt=limit)
        if outlets is not None:
            ev, lg = ev.filter(tenant_id__in=outlets), lg.filter(outlet_id__in=outlets)
        else:   # rows that belong to no outlet use the default
            ev = ev.exclude(tenant_id__in=all_outlets)
            lg = lg.filter(outlet__isnull=True)
        n_ev, n_lg = ev.count(), lg.count()
        n_flags = AuditFlag.objects.filter(event__in=ev).count() if n_ev else 0
        if not dry_run and (n_ev or n_lg):
            while True:
                ids = list(ev.values_list('id', flat=True)[:PURGE_BATCH])
                if not ids:
                    break
                with transaction.atomic():
                    with connection.cursor() as c:
                        _allow_purge(c)
                    AuditFlag.objects.filter(event_id__in=ids).delete()
                    ActivityEvent.objects.filter(id__in=ids).delete()
            lg.delete()
            pol.last_purge_at, pol.last_purge_count = now, n_ev + n_lg
            pol.save(update_fields=['last_purge_at', 'last_purge_count', 'updated_at'])
        removed['events'] += n_ev
        removed['flags'] += n_flags
        removed['old_log'] += n_lg
    if not dry_run and record and (removed['events'] or removed['old_log']):
        from apps.audit import recorder
        recorder.record('audit.purged', actor_type='system', ctx={'days': DEFAULT_RETENTION_DAYS, 'count': removed['events'] + removed['old_log']}, source='job',
                        metadata=removed)
    return {'dryRun': dry_run, **removed}


def maybe_purge():
    """Called from event writes: at most about once a day, never raises, never slows the action that triggered it (runs after commit)."""
    try:
        pol = get_policy(None)
        if pol.last_purge_at and timezone.now() - pol.last_purge_at < PURGE_EVERY:
            return
        # claim the day first so two requests do not both purge
        updated = AuditPolicy.objects.filter(pk=pol.pk, last_purge_at=pol.last_purge_at).update(last_purge_at=timezone.now())
        if updated:
            purge(dry_run=False)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('audit purge failed')
