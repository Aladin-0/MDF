"""
The audit API (super admin only; every query is scoped to the super admin's own organisation).

  GET  /audit/events/            the activity feed: filters that WORK (person, category, severity, flagged, dates, time of day, amount, entity, search)
  GET  /audit/events/<id>/       one event with the other events on the same record
  GET  /audit/flags/             "needs attention": flags, newest and most severe first
  POST /audit/flags/<id>/review/ reviewed / not a problem, with a note
  GET  /audit/summary/           the numbers for the menu badge and the page header
  GET  /audit/people/            one row per person: what they did, how it compares, devices
  GET  /audit/people/<id>/       a person's recent activity
  GET  /audit/export/            the filtered feed as Excel (names not ids, formula-safe, capped; the export is itself recorded)
  GET  /audit/edit-log/          per person: created / edited / cancelled-or-deleted, for the accountant (JSON, or Excel with ?export=xlsx)
  GET/PUT /audit/policy/         how long to keep the trail, which rules are on and how sensitive
"""
from datetime import date, datetime, time, timedelta
from io import BytesIO

from django.db.models import Count, Max, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import policy as pol
from apps.audit import recorder, rules
from apps.audit import vocabulary as vocab
from apps.audit.models import ActivityEvent, AuditFlag
from apps.audit.permissions import IsSuperAdmin

MAX_PAGE = 100
EXPORT_CAP = 20_000
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
SEV_RANK = {'critical': 3, 'warning': 2, 'notice': 1, 'info': 0}


def _err(message, code='BAD_REQUEST', http=status.HTTP_400_BAD_REQUEST):
    return Response({'error': {'code': code, 'message': message}}, status=http)


# ───────────────────────────── scope ─────────────────────────────

def org_outlet_ids(user):
    """The outlets of the signed-in super admin's organisation. A super admin never sees another organisation's trail."""
    from apps.core.models import Outlet
    outlet = getattr(user, 'outlet', None)
    org = getattr(outlet, 'organization_id', None)
    if not org:
        return []
    return [str(i) for i in Outlet.objects.filter(organization_id=org).values_list('id', flat=True)]


def org_id_of(user):
    return str(getattr(getattr(user, 'outlet', None), 'organization_id', '') or '') or None


def _scope(user):
    """
    This organisation's rows. Rows that belong to no outlet (a failed sign-in for a number nobody owns) can not be assigned to an organisation,
    so they are shown only when the installation has exactly ONE organisation; with several they would leak between them, so they are hidden.
    """
    from apps.core.models import Organization
    q = Q(tenant_id__in=org_outlet_ids(user))
    if Organization.objects.count() == 1:
        q |= Q(tenant_id__isnull=True) | Q(tenant_id='')
    return q


def scoped_events(user):
    return ActivityEvent.objects.filter(_scope(user))


def scoped_flags(user):
    return AuditFlag.objects.filter(_scope(user))


# ───────────────────────────── shaping ─────────────────────────────

def _actor_names(events):
    """Names for events written before the snapshot existed (one query for the whole page)."""
    from apps.accounts.models import Staff
    ids = {e.actor_id for e in events if e.actor_id and not e.actor_name}
    if not ids:
        return {}
    return {str(s.id): s.name for s in Staff.objects.filter(id__in=ids).only('id', 'name')}


def entity_ref(e):
    """What the screen can open: a sale or purchase invoice has a preview; everything else is shown as text."""
    kind = {'SaleInvoice': 'sale', 'PurchaseInvoice': 'purchase'}.get(e.entity_type, '')
    return {'type': e.entity_type, 'id': e.entity_id, 'label': e.entity_label, 'viewer': {'kind': kind, 'id': e.entity_id} if kind and e.entity_id else None}


def event_json(e, names=None, flags=None):
    names = names or {}
    actor_name = e.actor_name or names.get(e.actor_id or '', '') or ('System' if e.actor_type != 'human' else '')
    code = e.code or vocab.infer_code(e.module, e.action, e.entity_type)
    summary = e.summary
    if not summary:      # an event written before sentences existed: build it now from what it has
        summary = vocab.render(code, {'actor': actor_name or 'Someone', 'entity': e.entity_label or e.entity_type, 'amount': e.amount, 'reason': e.reason_text,
                                      'device': e.device, 'label': f'{e.module} {e.action}', 'detail': (e.metadata_json or {}).get('description', '')})
    category = e.category or vocab.category_of(code, e.module)
    return {
        'id': str(e.id), 'occurredAt': e.occurred_at.isoformat(), 'code': code, 'action': e.action, 'module': e.module,
        'category': category, 'categoryLabel': vocab.CATEGORIES.get(category, category.title()),
        'label': getattr(vocab.spec_of(code), 'label', '') or f'{e.module} {e.action}'.strip(),
        'summary': summary, 'severity': e.severity if e.severity in SEV_RANK else 'info',
        'actor': {'id': e.actor_id, 'name': actor_name, 'role': e.actor_role},
        'outlet': e.outlet_name, 'entity': entity_ref(e), 'amount': float(e.amount) if e.amount is not None else None,
        'changes': e.changes_json if isinstance(e.changes_json, list) else [], 'reason': e.reason_text, 'device': e.device, 'ip': e.ip_address,
        'insideNetwork': e.inside_network, 'source': e.source, 'requestId': e.request_id,
        'flags': [{'id': str(f.id), 'rule': f.rule_code, 'severity': f.severity, 'title': f.title, 'status': f.status} for f in (flags or {}).get(e.id, [])],
    }


def _flags_by_event(events):
    out = {}
    for f in AuditFlag.objects.filter(event_id__in=[e.id for e in events]):
        out.setdefault(f.event_id, []).append(f)
    return out


def flag_json(f):
    ev = f.event
    return {
        'id': str(f.id), 'rule': f.rule_code, 'severity': f.severity, 'title': f.title, 'why': f.why, 'evidence': f.evidence_json, 'status': f.status,
        'createdAt': f.created_at.isoformat(), 'person': {'id': f.subject_actor_id, 'name': f.subject_name}, 'eventId': str(f.event_id),
        'event': {'occurredAt': ev.occurred_at.isoformat(), 'summary': ev.summary or f.title, 'entity': entity_ref(ev), 'amount': float(ev.amount) if ev.amount is not None else None,
                  'device': ev.device, 'ip': ev.ip_address, 'insideNetwork': ev.inside_network},
        'review': {'by': f.reviewed_by_name, 'at': f.reviewed_at.isoformat() if f.reviewed_at else None, 'note': f.review_note},
    }


# ───────────────────────────── filters ─────────────────────────────

class FilterError(ValueError):
    pass


def _d(raw, name):
    try:
        return date.fromisoformat(raw)
    except (TypeError, ValueError):
        raise FilterError(f'{name} must be a date like 2026-11-17')


def _hour(raw, name):
    try:
        v = int(raw)
    except (TypeError, ValueError):
        raise FilterError(f'{name} must be an hour from 0 to 23')
    if not 0 <= v <= 23:
        raise FilterError(f'{name} must be an hour from 0 to 23')
    return v


def _num(raw, name):
    try:
        return float(raw)
    except (TypeError, ValueError):
        raise FilterError(f'{name} must be a number')


def apply_filters(qs, p):
    """Every filter the feed and the export share. Raises FilterError (a 400) on a bad value; an unknown value just matches nothing."""
    if p.get('actor'):
        qs = qs.filter(actor_id=p['actor'])
    if p.get('category'):
        qs = qs.filter(category__in=[c for c in p['category'].split(',') if c])
    if p.get('module'):
        qs = qs.filter(module=p['module'])
    if p.get('code'):
        qs = qs.filter(code__in=[c for c in p['code'].split(',') if c])
    if p.get('severity'):
        qs = qs.filter(severity__in=[c for c in p['severity'].split(',') if c])
    if str(p.get('flagged', '')).lower() in ('1', 'true', 'yes'):
        qs = qs.filter(flag_count__gt=0)
    if p.get('from'):
        qs = qs.filter(occurred_at__gte=datetime.combine(_d(p['from'], 'from'), time.min))
    if p.get('to'):
        qs = qs.filter(occurred_at__lt=datetime.combine(_d(p['to'], 'to') + timedelta(days=1), time.min))
    if p.get('hourFrom') not in (None, '') or p.get('hourTo') not in (None, ''):
        lo, hi = _hour(p.get('hourFrom', 0), 'hourFrom'), _hour(p.get('hourTo', 23), 'hourTo')
        qs = qs.filter(occurred_at__hour__gte=lo, occurred_at__hour__lte=hi) if lo <= hi else qs.filter(Q(occurred_at__hour__gte=lo) | Q(occurred_at__hour__lte=hi))   # 22 to 5 wraps midnight
    if p.get('amountMin') not in (None, ''):
        qs = qs.filter(amount__gte=_num(p['amountMin'], 'amountMin'))
    if p.get('amountMax') not in (None, ''):
        qs = qs.filter(amount__lte=_num(p['amountMax'], 'amountMax'))
    if p.get('entityType'):
        qs = qs.filter(entity_type=p['entityType'])
    if p.get('entityId'):
        qs = qs.filter(entity_id=p['entityId'])
    q = (p.get('q') or '').strip()[:100]
    if q:
        qs = qs.filter(Q(summary__icontains=q) | Q(entity_label__icontains=q) | Q(actor_name__icontains=q) | Q(reason_text__icontains=q))
    return qs


def _page(p):
    try:
        size = max(1, min(MAX_PAGE, int(p.get('pageSize') or 50)))
        page = max(1, int(p.get('page') or 1))
    except ValueError:
        raise FilterError('page and pageSize must be whole numbers')
    return page, size


# ───────────────────────────── views ─────────────────────────────

class EventListView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        try:
            qs = apply_filters(scoped_events(request.user), request.query_params)
            page, size = _page(request.query_params)
        except FilterError as e:
            return _err(str(e), 'BAD_FILTER')
        total = qs.count()
        rows = list(qs.order_by('-occurred_at', '-id')[(page - 1) * size: page * size])
        names, flags = _actor_names(rows), _flags_by_event(rows)
        return Response({'results': [event_json(e, names, flags) for e in rows], 'count': total,
                         'pagination': {'page': page, 'pageSize': size, 'pages': max(1, -(-total // size)), 'total': total}})


class EventDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request, event_id):
        e = scoped_events(request.user).filter(id=event_id).first()
        if not e:
            return _err('Event not found', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)
        related = []
        if e.entity_id:
            related = list(scoped_events(request.user).filter(entity_type=e.entity_type, entity_id=e.entity_id).exclude(id=e.id).order_by('-occurred_at')[:20])
        rows = [e] + related
        names, flags = _actor_names(rows), _flags_by_event(rows)
        body = event_json(e, names, flags)
        body['metadata'] = e.metadata_json
        body['related'] = [event_json(r, names, flags) for r in related]
        return Response(body)


class FlagListView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        p = request.query_params
        qs = scoped_flags(request.user).select_related('event')
        st = p.get('status', 'new')
        if st != 'all':
            qs = qs.filter(status=st)
        if p.get('severity'):
            qs = qs.filter(severity__in=p['severity'].split(','))
        if p.get('person'):
            qs = qs.filter(subject_actor_id=p['person'])
        try:
            page, size = _page(p)
        except FilterError as e:
            return _err(str(e), 'BAD_FILTER')
        items = sorted(qs[:2000], key=lambda f: (-SEV_RANK.get(f.severity, 0), -f.created_at.timestamp()))
        return Response({'results': [flag_json(f) for f in items[(page - 1) * size: page * size]], 'count': len(items)})


class FlagReviewView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, flag_id):
        f = scoped_flags(request.user).select_related('event').filter(id=flag_id).first()
        if not f:
            return _err('Flag not found', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)
        new = request.data.get('status')
        if new not in ('reviewed', 'dismissed', 'new'):
            return _err('status must be reviewed, dismissed or new', 'BAD_STATUS')
        note = str(request.data.get('note') or '').strip()[:1000]
        if new == 'dismissed' and not note:
            return _err('Say why this is not a problem (a short note)', 'NOTE_REQUIRED')
        f.status = new
        f.reviewed_by_id, f.reviewed_by_name = str(request.user.pk), request.user.name or ''
        f.reviewed_at, f.review_note = (timezone.now() if new != 'new' else None), note
        f.save(update_fields=['status', 'reviewed_by_id', 'reviewed_by_name', 'reviewed_at', 'review_note'])
        recorder.safe_record('audit.flag_reviewed', actor=request.user, module='audit', action='REVIEW', entity_type='AuditFlag', entity_id=str(f.id), entity_label=f.title,
                             reason=note, ctx={'status': 'reviewed' if new == 'reviewed' else 'not a problem' if new == 'dismissed' else 'new again'}, metadata={'flag': str(f.id), 'rule': f.rule_code})
        return Response(flag_json(f))


class SummaryView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        flags = scoped_flags(request.user).filter(status='new')
        counts = {k: 0 for k in ('critical', 'warning', 'notice')}
        for sev, n in flags.values_list('severity').annotate(n=Count('id')):
            counts[sev] = counts.get(sev, 0) + n
        events = scoped_events(request.user)
        today = datetime.combine(date.today(), time.min)
        policy = pol.get_policy(org_id_of(request.user))
        last = events.aggregate(m=Max('occurred_at'))['m']
        return Response({'newFlags': {**counts, 'total': sum(counts.values())}, 'eventsToday': events.filter(occurred_at__gte=today).count(),
                         'lastEventAt': last.isoformat() if last else None, 'failedWrites': recorder.failed_writes(), 'retentionDays': policy.retention_days,
                         'lastPurgeAt': policy.last_purge_at.isoformat() if policy.last_purge_at else None})


def _people_rows(user, days):
    since = datetime.combine(date.today(), time.min) - timedelta(days=days - 1)
    qs = scoped_events(user).filter(occurred_at__gte=since, actor_type='human').exclude(actor_id__isnull=True).exclude(actor_id='')
    rows = {}
    for r in qs.values('actor_id', 'actor_name', 'actor_role').annotate(total=Count('id'), last=Max('occurred_at'),
                                                                        money=Count('id', filter=Q(category='money')), stock=Count('id', filter=Q(category='stock')),
                                                                        people=Count('id', filter=Q(category='people')), settings=Count('id', filter=Q(category='settings')),
                                                                        cancelled=Count('id', filter=Q(code__in=['bill.cancelled', 'bill.reissued'])),
                                                                        paid_changes=Count('id', filter=Q(code='bill.corrected_after_payment')),
                                                                        writeoffs=Count('id', filter=Q(code__in=['stock.bulk_written_off'])),
                                                                        flagged=Count('id', filter=Q(flag_count__gt=0))):
        cur = rows.setdefault(r['actor_id'], dict(r, actor_name=r['actor_name'] or '', actor_role=r['actor_role'] or ''))
        if r['actor_name'] and not cur['actor_name']:
            cur['actor_name'] = r['actor_name']
    names = _actor_names([ActivityEvent(actor_id=i, actor_name='') for i in rows])
    open_flags = dict(scoped_flags(user).filter(status='new').exclude(subject_actor_id='').values_list('subject_actor_id').annotate(n=Count('id')))
    devices = {}
    for a, d, last in qs.filter(code='login.succeeded').exclude(device='').values_list('actor_id', 'device').annotate(m=Max('occurred_at')):
        devices.setdefault(a, []).append({'device': d, 'lastSeen': last.isoformat()})
    out = []
    for i, r in rows.items():
        out.append({'id': i, 'name': r['actor_name'] or names.get(i, '') or 'Unknown', 'role': r['actor_role'], 'events': r['total'], 'lastActive': r['last'].isoformat(),
                    'byCategory': {'money': r['money'], 'stock': r['stock'], 'people': r['people'], 'settings': r['settings']},
                    'cancelled': r['cancelled'], 'paidBillChanges': r['paid_changes'], 'writeOffs': r['writeoffs'], 'flaggedEvents': r['flagged'],
                    'openFlags': open_flags.get(i, 0), 'devices': sorted(devices.get(i, []), key=lambda x: x['lastSeen'], reverse=True)[:5]})
    n = max(len(out), 1)
    for key in ('cancelled', 'paidBillChanges', 'writeOffs'):      # how each person compares with the average of the others
        total = sum(o[key] for o in out)
        for o in out:
            others = (total - o[key]) / max(n - 1, 1) if n > 1 else 0
            o[key + 'Vs'] = round(o[key] / others, 1) if others else None
    return sorted(out, key=lambda o: (-o['openFlags'], -o['events']))


class PeopleView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        try:
            days = max(1, min(365, int(request.query_params.get('days') or 30)))
        except ValueError:
            return _err('days must be a whole number', 'BAD_FILTER')
        return Response({'days': days, 'results': _people_rows(request.user, days)})


class PersonView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request, actor_id):
        days = 30
        people = {p['id']: p for p in _people_rows(request.user, days)}
        rows = list(scoped_events(request.user).filter(actor_id=actor_id).order_by('-occurred_at')[:60])
        if not rows and actor_id not in people:
            return _err('Nobody with that id has any recorded activity', 'NOT_FOUND', status.HTTP_404_NOT_FOUND)
        names, flags = _actor_names(rows), _flags_by_event(rows)
        return Response({'person': people.get(actor_id), 'days': days, 'recent': [event_json(e, names, flags) for e in rows]})


# ───────────────────────────── exports ─────────────────────────────

class ExportView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        from apps.inventory import xlsx_helpers as xh
        import openpyxl
        try:
            qs = apply_filters(scoped_events(request.user), request.query_params)
        except FilterError as e:
            return _err(str(e), 'BAD_FILTER')
        total = qs.count()
        rows = list(qs.order_by('-occurred_at', '-id')[:EXPORT_CAP])
        names, flags = _actor_names(rows), _flags_by_event(rows)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Audit trail'
        now = datetime.now().strftime('%d %b %Y %H:%M')
        xh.title_block(ws, 'Audit trail', f'Exported {now} by {request.user.name} · {min(total, EXPORT_CAP):,} event(s), newest first' + (f' (the newest {EXPORT_CAP:,} of {total:,}: narrow the dates for the rest)' if total > EXPORT_CAP else ''),
                       'Who did what, when and from where. Flagged events are marked.')
        labels = ['When', 'Who', 'Role', 'What happened', 'Type', 'Amount (₹)', 'Reason', 'Document', 'Device', 'IP address', 'On the shop network', 'Severity', 'Flags']
        xh.header(ws, 4, labels, [19, 22, 14, 70, 22, 13, 30, 24, 22, 15, 12, 10, 40], right={6})
        for e in rows:
            j = event_json(e, names, flags)
            ws.append([e.occurred_at, xh.safe(j['actor']['name']), j['actor']['role'], xh.safe(j['summary']), j['categoryLabel'], j['amount'], xh.safe(e.reason_text), xh.safe(e.entity_label),
                       xh.safe(e.device), e.ip_address or '', {True: 'Yes', False: 'No', None: ''}[e.inside_network], j['severity'], xh.safe('; '.join(f['title'] for f in j['flags']))])
        last = ws.max_row
        xh.style_cells(ws, 5, last, {1: 'dd-mmm-yyyy hh:mm', 6: xh.MONEY}, right={6}, wrap={4})
        xh.finish(ws, 4, last, len(labels), freeze_cols=2)
        buf = BytesIO()
        wb.save(buf)
        # exporting the audit trail is itself something the trail must remember
        recorder.safe_record('audit.exported', actor=request.user, module='audit', action='EXPORT', ctx={'count': min(total, EXPORT_CAP)},
                             metadata={'rows': min(total, EXPORT_CAP), 'filters': {k: v for k, v in request.query_params.items()}})
        resp = HttpResponse(buf.getvalue(), content_type=XLSX)
        resp['Content-Disposition'] = f'attachment; filename="audit-trail_{date.today().isoformat()}.xlsx"'
        return resp


EDIT_GROUPS = {
    'Created': lambda c: c.endswith('.created') or c in ('payment.received', 'bill.created'),
    'Changed': lambda c: c.endswith('.edited') or c.endswith('.adjusted') or c in ('bill.corrected_after_payment', 'credit_limit.changed', 'staff.role_changed', 'staff.pin_changed', 'settings.changed', 'settings.secret_changed'),
    'Cancelled or removed': lambda c: c in ('bill.cancelled', 'bill.reissued', 'staff.deactivated', 'stock.bulk_written_off'),
}


class EditLogView(APIView):
    """What an accountant asks: for each person, how many records they created, changed and cancelled or removed (the Tally "edit log summary")."""
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        p = request.query_params
        try:
            start = _d(p.get('from') or (date.today() - timedelta(days=29)).isoformat(), 'from')
            end = _d(p.get('to') or date.today().isoformat(), 'to')
        except FilterError as e:
            return _err(str(e), 'BAD_FILTER')
        qs = scoped_events(request.user).filter(occurred_at__gte=datetime.combine(start, time.min), occurred_at__lt=datetime.combine(end + timedelta(days=1), time.min)) \
            .exclude(actor_id__isnull=True).exclude(actor_id='')
        table = {}
        for actor, name, role, code, n in qs.values_list('actor_id', 'actor_name', 'actor_role', 'code').annotate(n=Count('id')):
            row = table.setdefault(actor, {'id': actor, 'name': name or '', 'role': role or '', **{g: 0 for g in EDIT_GROUPS}})
            row['name'] = row['name'] or name
            for g, fn in EDIT_GROUPS.items():
                if fn(code or ''):
                    row[g] += n
        names = _actor_names([ActivityEvent(actor_id=i, actor_name='') for i in table])
        for i, r in table.items():
            r['name'] = r['name'] or names.get(i, '') or 'Unknown'
        data = sorted(table.values(), key=lambda r: -(r['Created'] + r['Changed'] + r['Cancelled or removed']))
        if p.get('export') != 'xlsx':
            return Response({'from': start.isoformat(), 'to': end.isoformat(), 'groups': list(EDIT_GROUPS), 'results': data})
        from apps.inventory import xlsx_helpers as xh
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Edit log summary'
        xh.title_block(ws, 'Edit log summary', f'{start.strftime("%d %b %Y")} to {end.strftime("%d %b %Y")}', 'How many records each person created, changed, and cancelled or removed.')
        labels = ['Person', 'Role'] + list(EDIT_GROUPS)
        xh.header(ws, 4, labels, [28, 16, 12, 12, 22], right={3, 4, 5})
        for r in data:
            ws.append([xh.safe(r['name']), r['role']] + [r[g] for g in EDIT_GROUPS])
        xh.style_cells(ws, 5, ws.max_row, {3: xh.INT, 4: xh.INT, 5: xh.INT}, right={3, 4, 5})
        xh.finish(ws, 4, ws.max_row, len(labels), landscape=False)
        buf = BytesIO()
        wb.save(buf)
        recorder.safe_record('data.exported', actor=request.user, module='audit', action='EXPORT', ctx={'what': 'the edit log summary', 'count': len(data)}, metadata={'rows': len(data)})
        resp = HttpResponse(buf.getvalue(), content_type=XLSX)
        resp['Content-Disposition'] = f'attachment; filename="edit-log-summary_{end.isoformat()}.xlsx"'
        return resp


# ───────────────────────────── settings ─────────────────────────────

def _rules_view(policy):
    out = []
    for code, base in rules.RULES.items():
        cfg = pol.rule_setting(policy, code, base)
        out.append({'code': code, 'title': base['title'], 'why': base['why'], 'enabled': bool(cfg.get('enabled', True)),
                    'params': {k: cfg[k] for k in base if k not in ('title', 'why', 'enabled')}})
    return out


class PolicyView(APIView):
    permission_classes = [IsSuperAdmin]

    def _body(self, request, policy):
        events = scoped_events(request.user)
        oldest = events.order_by('occurred_at').values_list('occurred_at', flat=True).first()
        last = events.aggregate(m=Max('occurred_at'))['m']
        return {'retentionDays': policy.retention_days, 'minRetentionDays': pol.MIN_RETENTION_DAYS, 'rules': _rules_view(policy),
                'health': {'events': events.count(), 'oldestEventAt': oldest.isoformat() if oldest else None, 'lastEventAt': last.isoformat() if last else None,
                           'failedWrites': recorder.failed_writes(), 'lastPurgeAt': policy.last_purge_at.isoformat() if policy.last_purge_at else None,
                           'lastPurgeCount': policy.last_purge_count}}

    def get(self, request):
        return Response(self._body(request, pol.get_policy(org_id_of(request.user))))

    def put(self, request):
        policy = pol.get_policy(org_id_of(request.user))
        changed = []
        if 'retentionDays' in request.data:
            try:
                days = int(request.data['retentionDays'])
            except (TypeError, ValueError):
                return _err('retentionDays must be a whole number of days', 'BAD_VALUE')
            if days < pol.MIN_RETENTION_DAYS or days > 3650:
                return _err(f'Keep the trail for between {pol.MIN_RETENTION_DAYS} and 3650 days', 'BAD_VALUE')
            if days != policy.retention_days:
                changed.append(f'keep for {days} days (was {policy.retention_days})')
                policy.retention_days = days
        if 'rules' in request.data:
            cfg = dict(policy.rules_json or {})
            for code, change in (request.data['rules'] or {}).items():
                if code not in rules.RULES or not isinstance(change, dict):
                    return _err(f'Unknown rule: {code}', 'BAD_RULE')
                clean = dict(cfg.get(code, {}))
                for k, v in change.items():
                    if k == 'enabled':
                        clean['enabled'] = bool(v)
                    elif k in rules.RULES[code] and k not in ('title', 'why'):
                        try:
                            num = float(v)
                        except (TypeError, ValueError):
                            return _err(f'{k} of {code} must be a number', 'BAD_VALUE')
                        if num <= 0:
                            return _err(f'{k} of {code} must be more than 0', 'BAD_VALUE')
                        clean[k] = int(num) if float(num).is_integer() else num
                    else:
                        return _err(f'Unknown setting {k} for {code}', 'BAD_RULE')
                if clean != cfg.get(code, {}):
                    changed.append(f"{rules.RULES[code]['title'].lower()}")
                    cfg[code] = clean
            policy.rules_json = cfg
        policy.updated_by_name = request.user.name or ''
        policy.save()
        if changed:
            recorder.safe_record('audit.policy_changed', actor=request.user, module='audit', action='UPDATE', ctx={'what': '; '.join(changed)}, metadata={'changes': changed})
        return Response(self._body(request, policy))
