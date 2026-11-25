"""Work out what loading the files would change. Reads the catalogue; writes nothing."""
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from apps.core.models import Outlet
from apps.inventory import ledger_health
from apps.inventory.models import MasterProduct

from . import rules
from .files import MargItem, StockRow, StockSheet
from .rules import Pack, name_key

# What the shop must look at. The first two stop a real load until they are answered (or explicitly waved through).
MRP_MISSING = 'mrp_missing'
QTY_UNCLEAR = 'qty_unclear'
COST_ABOVE_MRP = 'cost_above_mrp'
COST_PER_PIECE = 'cost_per_piece'
TAX_MISSING = 'tax_missing'
NEGATIVE_STOCK = 'negative_stock'
BLOCKING = (MRP_MISSING, QTY_UNCLEAR)


@dataclass
class Answers:
    """What the shop wrote back in the Excel lists (report.read_answers). Keys are name keys, so spelling does not matter."""
    mrp: dict = field(default_factory=dict)         # (product key, batch) -> Decimal
    cost: dict = field(default_factory=dict)        # (product key, batch) -> Decimal, the cost of one full pack
    loose: dict = field(default_factory=dict)       # (product key, batch) -> int, loose pieces
    pack_size: dict = field(default_factory=dict)   # product key -> int, units in one pack
    tax: dict = field(default_factory=dict)         # product key -> (hsn or '', gst or None)


def batch_key(product_name, batch_text) -> tuple:
    return name_key(product_name), ' '.join((batch_text or '').upper().split())


@dataclass
class Issue:
    kind: str
    product: str
    row: StockRow | None = None
    detail: dict = field(default_factory=dict)


@dataclass
class ProductPlan:
    key: str
    name: str                        # the spelling a new product gets / the catalogue's own name
    marg: MargItem | None
    product: MasterProduct | None    # the catalogue entry this item maps to (None: it will be created)
    twins: list                      # the same item under another spelling
    shared: bool                     # another outlet uses it: never changed
    in_stock: bool
    pack: Pack
    pack_source: str
    create: dict | None = None
    changes: dict = field(default_factory=dict)   # field -> (old, new)


@dataclass
class BatchPlan:
    row: StockRow
    product_key: str
    batch_no: str
    expiry: date
    has_expiry: bool
    prices: rules.Prices
    packs: int
    loose: int
    pack: Pack

    @property
    def units(self) -> int:
        return self.packs * self.pack.size + self.loose

    @property
    def packs_decimal(self) -> Decimal:
        return ledger_health.packs(self.units, self.pack.size)

    @property
    def landing_value(self) -> Decimal:
        return rules.money(self.packs_decimal * self.prices.landing)


@dataclass
class Plan:
    outlet: Outlet
    sheet: StockSheet
    products: dict = field(default_factory=dict)   # name key -> ProductPlan
    batches: list = field(default_factory=list)
    issues: list = field(default_factory=list)
    notes: list = field(default_factory=list)
    marg_opening: list = field(default_factory=list)   # (product key, qty, value, rate): Marg's stock on the first day of its books

    @property
    def books_start(self) -> date:
        """The first day of the financial year the stock report falls in (Indian year: 1 April)."""
        on = self.sheet.as_on
        return date(on.year if on.month >= 4 else on.year - 1, 4, 1)

    def of(self, kind) -> list:
        return [i for i in self.issues if i.kind == kind]

    @property
    def blocking(self) -> list:
        return [i for i in self.issues if i.kind in BLOCKING]

    def totals(self) -> dict:
        on = self.sheet.as_on
        return {
            'batches': len(self.batches),
            'products_in_stock': len({b.product_key for b in self.batches}),
            'whole_packs': sum(b.packs for b in self.batches),
            'loose_units': sum(b.loose for b in self.batches),
            'landing_value': sum((b.landing_value for b in self.batches), Decimal('0')),
            'sheet_value_of_loaded_rows': sum((b.row.value for b in self.batches), Decimal('0')),
            'with_expiry': sum(1 for b in self.batches if b.has_expiry),
            'already_expired': sum(1 for b in self.batches if b.has_expiry and b.expiry < on),
            'products_to_create': sum(1 for p in self.products.values() if p.create),
            'products_to_update': sum(1 for p in self.products.values() if p.changes),
            'marg_opening_stock': sum((v for _, _, v, _ in self.marg_opening), Decimal('0')),
        }


# ── the catalogue ────────────────────────────────────────────────────────────────────────────────────────────────

def _outlet_path(model, depth=2):
    """How to get from a row of `model` to its outlet ("outlet", "invoice__outlet"), or None when it has none."""
    for f in model._meta.fields:
        if f.is_relation and f.related_model is Outlet:
            return f.name
    if depth > 1:
        for f in model._meta.fields:
            if f.is_relation and f.many_to_one and f.related_model not in (model, MasterProduct):
                sub = _outlet_path(f.related_model, depth - 1)
                if sub:
                    return f'{f.name}__{sub}'
    return None


def products_used_elsewhere(outlet) -> set:
    """
    Ids of products something OUTSIDE this outlet points at (a batch, a purchase line, an OCR alias, a PO line...).
    The catalogue is shared by every outlet, so these are never edited by an import for one outlet. A table whose
    outlet cannot be worked out counts as "elsewhere": when in doubt the product is left alone.
    """
    used = set()
    for rel in MasterProduct._meta.related_objects:
        model, fk = rel.related_model, rel.field.name
        qs = model._base_manager.filter(**{f'{fk}__isnull': False})
        path = _outlet_path(model)
        if path:
            qs = qs.exclude(**{path: outlet})
        used.update(qs.values_list(f'{fk}_id', flat=True).distinct())
    return used


def _choose(candidates, sheet_name, elsewhere):
    """
    One catalogue entry for an item that exists under several spellings: the stock sheet's spelling (the real one),
    else one another outlet already uses, else the fuller name (the copy that kept its `*` and `/`), else the older.
    """
    def score(p):
        return (
            bool(sheet_name) and rules.same_spelling(p.name, sheet_name),
            p.id in elsewhere,
            len(' '.join(p.name.split())),
            -p.created_at.timestamp(),
        )
    return max(candidates, key=score)


def _pack_of(p) -> Pack:
    return Pack(int(p.pack_size or 1), p.pack_unit or '', p.pack_type or '')


def build_plan(outlet, items, sheet: StockSheet, answers: Answers | None = None) -> Plan:
    answers = answers or Answers()
    plan = Plan(outlet=outlet, sheet=sheet)

    marg = {}
    for it in items:
        k = name_key(it.name)
        if not k:
            continue
        if k in marg:
            plan.notes.append(f'Marg has two items that read the same without punctuation: "{marg[k].name}" and "{it.name}". The first is used.')
            continue
        marg[k] = it
    rows = defaultdict(list)
    for r in sheet.rows:
        rows[name_key(r.name)].append(r)

    catalogue = defaultdict(list)
    for p in MasterProduct.objects.all():
        catalogue[name_key(p.name)].append(p)
    elsewhere = products_used_elsewhere(outlet)

    for key in sorted(set(marg) | set(rows)):
        item, its_rows = marg.get(key), rows.get(key, [])
        sheet_name = its_rows[0].name if its_rows else ''
        candidates = catalogue.get(key, [])
        product = _choose(candidates, sheet_name, elsewhere) if candidates else None
        shared = bool(product) and product.id in elsewhere

        marg_hsn, marg_gst = (item.hsn, item.gst) if item else ('', None)
        hsn, gst = marg_hsn, marg_gst
        if hsn and not rules.valid_hsn(hsn):
            hsn, gst = '', None     # a slip in Marg ("005", 0%): the whole tax line goes to the shop, nothing is overwritten with it
        if key in answers.tax:
            a_hsn, a_gst = answers.tax[key]
            hsn, gst = a_hsn or hsn, a_gst if a_gst is not None else gst
        conversion = answers.pack_size.get(key) or rules.usable_conversion(item.conversion if item else 0)
        if item and item.conversion and not rules.usable_conversion(item.conversion) and item.conversion != 1:
            plan.notes.append(f'{item.name}: Marg says {item.conversion} units in one pack, which cannot be right. It is treated as sold one by one.')
        kind = rules.kind_of(sheet_name or (item.name if item else ''), item.unit if item else '', item.pack_text if item else '')
        pack, source = rules.decide_pack(kind, conversion, _pack_of(product) if product else None, keep_label=shared)

        pp = ProductPlan(
            key=key, name=product.name if product else (sheet_name or item.name), marg=item, product=product,
            twins=[c for c in candidates if c is not product], shared=shared, in_stock=bool(its_rows), pack=pack, pack_source=source,
        )
        company = (item.company if item else '') or (its_rows[0].company if its_rows else '')
        if product is None:
            pp.create = dict(
                name=pp.name[:255], composition='.', manufacturer=company[:255], category=company[:100],
                drug_type='surgical' if kind == 'piece' else 'allopathy', schedule_type='OTC', hsn_code=hsn or None,
                gst_rate=gst if gst is not None else Decimal('0'), pack_size=pack.size, pack_unit=pack.unit, pack_type=pack.type,
                mrp=max([r.mrp for r in its_rows] or [Decimal('0')]),
            )
        elif not shared:
            if hsn and hsn != (product.hsn_code or ''):
                pp.changes['hsn_code'] = (product.hsn_code, hsn)
            if gst is not None and gst != product.gst_rate:
                pp.changes['gst_rate'] = (product.gst_rate, gst)
            if company and rules.is_blank_text(product.manufacturer):
                pp.changes['manufacturer'] = (product.manufacturer, company[:255])
            old = _pack_of(product)
            for f, was, now in (('pack_size', old.size, pack.size), ('pack_unit', old.unit, pack.unit), ('pack_type', old.type, pack.type)):
                if was != now:
                    pp.changes[f] = (was, now)
        plan.products[key] = pp
        if item and item.opening_value:
            plan.marg_opening.append((key, item.opening_qty, item.opening_value, item.opening_rate))

        if not hsn or gst is None:
            plan.issues.append(Issue(TAX_MISSING, pp.name, detail={
                'in_stock': pp.in_stock, 'hsn': marg_hsn, 'gst': marg_gst,
                'catalogue_hsn': product.hsn_code if product else '', 'catalogue_gst': product.gst_rate if product else None,
            }))

        for r in its_rows:
            _plan_row(plan, pp, r, gst, answers)
    return plan


def _plan_row(plan, pp, r, gst, answers):
    if r.stock <= 0:
        if r.stock < 0:
            plan.issues.append(Issue(NEGATIVE_STOCK, r.name, r))
        return
    bkey = batch_key(r.name, r.batch)
    qty = rules.read_quantity(r.stock, pp.pack.size)
    loose = qty.loose
    if bkey in answers.loose and 0 <= answers.loose[bkey] < max(pp.pack.size, 1):
        loose = answers.loose[bkey]
    if loose is None:
        plan.issues.append(Issue(QTY_UNCLEAR, r.name, r, {'pack_size': pp.pack.size, 'choices': qty.choices, 'packs': qty.packs}))
        loose = 0      # the whole packs are loaded; the part is reported, never guessed
    if loose and not pp.pack.sells_loose:
        plan.issues.append(Issue(QTY_UNCLEAR, r.name, r, {'pack_size': pp.pack.size, 'choices': (loose,), 'packs': qty.packs,
                                                          'why': 'another outlet uses this product with a pack that cannot be sold loose'}))
        loose = 0
    if not qty.packs and not loose:
        return         # nothing certain to put on the shelf for this row (it is on the unclear list)

    p = rules.prices(answers.cost.get(bkey, r.cost), r.purchase_price, answers.mrp.get(bkey, r.mrp), gst)
    if bkey in answers.cost:     # the shop gave the cost of a full pack: the purchase rate follows it
        p = rules.prices(answers.cost[bkey], 0, p.mrp, gst)
    if p.mrp <= 0:
        plan.issues.append(Issue(MRP_MISSING, r.name, r))
    elif p.landing > p.mrp:
        plan.issues.append(Issue(COST_ABOVE_MRP, r.name, r, {'landing': p.landing, 'mrp': p.mrp}))
    if bkey not in answers.cost and rules.cost_looks_per_piece(p.landing, p.mrp, pp.pack.size):
        plan.issues.append(Issue(COST_PER_PIECE, r.name, r, {'pack_size': pp.pack.size, 'landing': p.landing, 'mrp': p.mrp}))

    expiry = rules.parse_expiry(r.expiry)
    plan.batches.append(BatchPlan(
        row=r, product_key=pp.key, batch_no=(r.batch or rules.NO_BATCH)[:100], expiry=expiry or rules.NO_EXPIRY,
        has_expiry=expiry is not None, prices=p, packs=qty.packs, loose=loose, pack=pp.pack,
    ))

