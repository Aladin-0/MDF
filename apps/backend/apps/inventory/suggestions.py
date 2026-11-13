"""
Suggestions for the free-text product fields (manufacturer, composition) from the catalogue itself.

The catalogue was imported from older systems where these two fields were mandatory, so they hold a lot of filler ("SURGICAL" in 1,629
compositions, "-BLANK-", "."), the same company spelt several ways (CIPLA / cipla) and typos. A plain "contains" search would show that
filler first. So the values are merged by a normalised key, the commonest spelling is shown, filler is dropped, and the list is ranked:
starts-with, then a word starts with it, then contains; the more products use a value, the higher it sits.

For a composition the commonest HSN code, GST rate and schedule among the products that have it are returned too, so the form can fill those
(the form only fills boxes the user left empty). The schedule is only offered when it is a real one: OTC is the default and proves nothing.
"""
import re
from collections import Counter, defaultdict

from django.db.models import Count, Q

from apps.inventory.models import MasterProduct

FIELDS = {'manufacturer': 'manufacturer', 'composition': 'composition'}
MAX_LIMIT = 15
_CANDIDATES = 400          # distinct spellings looked at before merging and ranking

# What is typed into these boxes when there is nothing to say. Lower case.
PLACEHOLDERS = {
    '', '.', '..', '...', '-', '--', 'na', 'n/a', 'nil', 'none', 'null', 'blank', '-blank-', 'unknown', 'misc', 'miscellaneous',
    'other', 'others', 'other products', 'general', 'general items', 'item', 'items', 'surgical', 'ayurvedic', 'ayurveda',
}


def is_placeholder(value: str) -> bool:
    v = (value or '').strip().lower()
    return v in PLACEHOLDERS or not re.search(r'[a-z]', v)


def norm_key(value: str) -> str:
    """The key two spellings of the same value share: case and runs of spaces ignored."""
    return ' '.join((value or '').upper().split())


def _rank(key: str, needle: str) -> int:
    """0 the whole value, 1 a word of it starts with what was typed, 2 it is somewhere inside. (Within a tier: the more products use it, the higher.)"""
    if not needle:
        return 1
    if key == needle:
        return 0
    if f' {needle}' in f' {key}':
        return 1
    return 2


def suggest_values(field: str, query: str, limit: int = 8):
    """[{'value', 'count'}] for `field`, best first. Compositions also carry 'hsnCode', 'gstRate', 'scheduleType' (the commonest among their products)."""
    column = FIELDS[field]
    limit = max(1, min(int(limit), MAX_LIMIT))
    words = [w for w in (query or '').split() if w][:5]

    qs = MasterProduct.objects.exclude(**{column: ''})
    for w in words:
        qs = qs.filter(**{f'{column}__icontains': w})
    rows = qs.values(column).annotate(n=Count('id')).order_by('-n')[:_CANDIDATES]

    merged = {}                                   # key -> {'count', 'spellings': Counter}
    for r in rows:
        raw = r[column]
        if is_placeholder(raw):
            continue
        key = norm_key(raw)
        m = merged.setdefault(key, {'count': 0, 'spellings': Counter()})
        m['count'] += r['n']
        m['spellings'][' '.join(raw.split())] += r['n']

    needle = norm_key(query)
    ordered = sorted(merged.items(), key=lambda kv: (_rank(kv[0], needle), -kv[1]['count'], kv[0]))[:limit]
    out = [{'value': m['spellings'].most_common(1)[0][0], 'count': m['count'], '_key': key, '_spellings': list(m['spellings'])} for key, m in ordered]

    if field == 'composition' and out:
        _attach_defaults(out)
    for o in out:
        o.pop('_key', None)
        o.pop('_spellings', None)
    return out


def _attach_defaults(items):
    """Commonest HSN / GST / schedule among the products of each suggested composition."""
    spellings = [s for o in items for s in o['_spellings']]
    # the stored spelling may differ in spacing from the cleaned one, so match on the stored values we saw
    stored = MasterProduct.objects.filter(composition__in=spellings).exclude(Q(hsn_code__isnull=True) | Q(hsn_code=''))
    tally = defaultdict(lambda: {'hsn': Counter(), 'gst': Counter(), 'sched': Counter()})
    for r in stored.values('composition', 'hsn_code', 'gst_rate', 'schedule_type').annotate(n=Count('id')):
        t = tally[norm_key(r['composition'])]
        t['hsn'][r['hsn_code'].strip()] += r['n']
        t['gst'][r['gst_rate']] += r['n']
        t['sched'][r['schedule_type']] += r['n']
    for o in items:
        t = tally.get(o['_key'])
        if not t or not t['hsn']:
            continue
        o['hsnCode'] = t['hsn'].most_common(1)[0][0]
        gst = t['gst'].most_common(1)[0][0]
        o['gstRate'] = float(gst) if gst is not None else None
        # "OTC" is what a product gets when nobody chose a schedule, so it says nothing about the composition: never offer it. A real schedule
        # (H, H1, X ...) is offered, because filling a stricter one by mistake is the safe way round.
        schedule = t['sched'].most_common(1)[0][0]
        if schedule and schedule != 'OTC':
            o['scheduleType'] = schedule
