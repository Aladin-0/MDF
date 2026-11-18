"""
Copy the old ActivityLog rows (what the audit screen showed until now) into the new trail so the history is not lost from view.

Dry run by default: it only counts. `--apply` writes. Safe to run again: every copied row remembers the old row's id and is skipped next time.
The old rows are NOT deleted here (the retention purge removes them when they are a year old).
"""
import uuid

from django.core.management.base import BaseCommand

from apps.audit import recorder, vocabulary as vocab
from apps.audit.models import ActivityEvent, ActivityLog

NAMESPACE = uuid.UUID('6f1c1d52-0c5c-4d0e-9a0e-5b0f3c0f7e11')


class Command(BaseCommand):
    help = 'Copy old ActivityLog rows into the new audit trail (dry run unless --apply)'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='actually write (default: only count)')
        parser.add_argument('--batch', type=int, default=500)

    def handle(self, *args, **o):
        qs = ActivityLog.objects.select_related('user', 'outlet').order_by('timestamp')
        total = qs.count()
        todo = copied = 0
        buf = []
        for log in qs.iterator(chunk_size=o['batch']):
            pk = uuid.uuid5(NAMESPACE, str(log.pk))             # the same old row always gets the same new id: reruns skip it
            buf.append((pk, log))
            if len(buf) >= o['batch']:
                t, c = self._flush(buf, o['apply'])
                todo, copied, buf = todo + t, copied + c, []
        t, c = self._flush(buf, o['apply'])
        todo, copied = todo + t, copied + c
        mode = 'copied' if o['apply'] else 'would copy'
        self.stdout.write(self.style.SUCCESS(f'{total} old row(s); {mode} {copied if o["apply"] else todo}; already in the new trail: {total - todo}.'))
        if not o['apply'] and todo:
            self.stdout.write('Dry run only. Run again with --apply to write them.')

    def _flush(self, buf, apply):
        if not buf:
            return 0, 0
        have = set(ActivityEvent.objects.filter(id__in=[pk for pk, _ in buf]).values_list('id', flat=True))
        new = [(pk, log) for pk, log in buf if pk not in have]
        if not apply or not new:
            return len(new), 0
        rows = []
        for pk, log in new:
            code = vocab.infer_code(log.module, log.action, log.entity_type)
            name = (log.user.name if log.user else '') or ''
            words = {'actor': name or 'Someone', 'entity': log.entity_label or log.entity_type, 'label': f'{log.module} {log.action}', 'detail': log.description or ''}
            meta = dict(log.metadata_json or {})
            meta['legacy_id'] = str(log.pk)
            if log.description:
                meta.setdefault('description', log.description)
            if log.endpoint:
                meta.setdefault('endpoint', log.endpoint)
                meta.setdefault('method', log.http_method)
            ua = log.user_agent or ''
            rows.append(ActivityEvent(
                id=pk, occurred_at=log.timestamp, tenant_id=str(log.outlet_id) if log.outlet_id else None, actor_id=str(log.user_id) if log.user_id else None,
                actor_type='human', actor_name=name[:255], actor_role=(log.user.role if log.user else '')[:50], outlet_name=(log.outlet.name if log.outlet else '')[:255],
                request_id=log.request_id or None, ip_address=log.ip_address, user_agent=ua, device=recorder.device_label(ua)[:160], source='web',
                action=log.action, module=log.module, code=code, category=vocab.category_of(code, log.module), entity_type=log.entity_type, entity_id=log.entity_id,
                entity_label=log.entity_label[:255], summary=vocab.render(code, words) if code else (log.description or ''),
                changes_json=recorder.normalise_changes(log.changes_json), metadata_json=recorder._jsonable(meta),
                severity=(vocab.spec_of(code).severity if code and vocab.spec_of(code) else 'info'),
            ))
        ActivityEvent.objects.bulk_create(rows, ignore_conflicts=True)
        return len(new), len(rows)
