"""
Phase 3 of the Marg reload: every entry of Marg's daybook becomes the MediFlow document it is, with its journal entry.

  Sales         -> SaleInvoice + SaleItem          + JournalEntry SALE
  Sale Return   -> SalesReturn + SalesReturnItem   + JournalEntry RETURN
  Purchase      -> PurchaseInvoice + PurchaseItem  + JournalEntry PURCHASE
  Purchase Ret. -> DebitNote + DebitNoteItem       + JournalEntry RETURN
  Payment, Receipt, Journal, Contra -> Voucher + VoucherLine + JournalEntry VOUCHER (the app writes both: the ledger
                   statement reads voucher lines, the trial balance / P&L / balance sheet read journal lines)

The journal lines are Marg's own ledger lines, plus each item's booking to its sales / purchase ledger, so every
ledger ends where Marg's does. Three things Marg's export gets wrong are corrected, each listed in the report:
  * paise: Marg leaves out the round-off line (3,900 bills): booked to "Round Off".
  * an item written twice (122 bills): a tax-free item booked both to "LOCAL SALES TAX PAID" and, again, through its
    item line. The item line's copy is dropped; the item is a tax-free line of the bill.
  * anything else that does not balance (purchases with freight Marg did not export): booked to the ledger
    "MARG DIFFERENCE (TO CHECK)" under Suspense Account, never hidden.

Old bills are history: they do NOT move stock (stock is the Phase 1 report). Their lines point at one switched-off,
empty "MARG-HISTORY" batch per product, so the live batches and their stock ledger are untouched.
"""
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, time
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import Count, Q, Sum

from apps.accounts.models import Customer, JournalEntry, JournalLine, Ledger, LedgerGroup, Staff, Voucher, VoucherLine
from apps.inventory.models import Batch, MasterProduct

from . import rules
from .parties import PAYMENT_LEDGERS, app_key, builtin_ledgers, natural_balance, norm, note_party
from .rules import name_key

ZERO = Decimal('0')
CENT = Decimal('0.01')
HISTORY_BATCH = 'MARG-HISTORY'
DIFF_LEDGER = 'MARG DIFFERENCE (TO CHECK)'
ROUNDING_LIMIT = Decimal('1.00')
SALE_KINDS = ('Sales', 'Sale Return')
BUY_KINDS = ('Purchase', 'Purchase Return')
VOUCHER_KINDS = {'Payment': 'payment', 'Receipt': 'receipt', 'Journal': 'journal', 'Contra': 'contra'}

_TAX = re.compile(r'\b([CSI])GST\b')
_RATE = re.compile(r'(\d+(?:\.\d+)?)\s*%')


def cents(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def tax_kind(ledger_name):
    """('C'|'S'|'I', GST rate of the item) for a GST ledger ("SGST SALES TAX 2.5 %" -> ('S', 5)); None otherwise."""
    m = _TAX.search((ledger_name or '').upper())
    if not m:
        return None
    r = _RATE.search(ledger_name)
    rate = Decimal(r.group(1)) if r else ZERO
    return m.group(1), rate * 2 if m.group(1) in 'CS' else rate


def item_rate(item) -> tuple[Decimal, bool]:
    """(GST rate, interstate) from the item's tax class ("LS-GST 5 %"). No class = no tax charged on it."""
    m = _RATE.search(item.tax_class or '')
    return (Decimal(m.group(1)) if m else ZERO), (item.tax_class or '').upper().startswith('CS')


def share(total: Decimal, weights: list) -> list:
    """Split `total` (rupees) over the weights in whole paise, the paise left over going to the biggest shares first."""
    total = cents(total)
    w = sum(weights, ZERO)
    if not weights or w == 0:
        return [ZERO] * len(weights)
    raw = [total * x / w for x in weights]
    out = [r.quantize(CENT, rounding='ROUND_DOWN') for r in raw]
    left = int((total - sum(out, ZERO)) / CENT)
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[:max(left, 0)]:
        out[i] += CENT
    return out


@dataclass
class Fix:
    kind: str          # 'rounding' / 'double' / 'difference' / 'renumbered'
    voucher: str
    number: str
    amount: Decimal
    detail: str = ''


@dataclass
class Entry:
    """One Marg voucher worked out: its journal lines and which item copies were dropped."""
    v: object
    lines: list                     # [(ledger name, Marg amount)], balanced
    dropped: set                    # indexes of items whose ledger copy was dropped (tax-free double)
    sales_ledgers_used: dict = field(default_factory=dict)


def journal_lines(v, fixes: list) -> Entry:
    lines = list(v.lines)
    alloc = [] if v.amount_layout else [(i, it) for i, it in enumerate(v.items) if it.alloc_ledger and it.alloc_amount is not None]
    lines += [(it.alloc_ledger, it.alloc_amount) for _, it in alloc]
    gap = sum((a for _, a in lines), ZERO)
    dropped = set()
    if abs(gap) > ROUNDING_LIMIT and alloc:
        # an item written twice: its booking through the item line AND a plain ledger line of (about) the same amount
        plain = [a for n, a in v.lines if not tax_kind(n) and norm(n) != norm(v.party) and (a > 0) == (gap > 0)]
        for i, it in alloc:
            if abs(gap) <= ROUNDING_LIMIT:
                break
            if (it.alloc_amount > 0) != (gap > 0):
                continue
            match = next((a for a in plain if abs(a - it.alloc_amount) <= ROUNDING_LIMIT), None)
            if match is not None and abs(gap - it.alloc_amount) < abs(gap):
                plain.remove(match)
                lines.remove((it.alloc_ledger, it.alloc_amount))
                dropped.add(i)
                gap -= it.alloc_amount
                fixes.append(Fix('double', v.kind, v.number, abs(it.alloc_amount), f'{it.name}: kept on the tax-free ledger line, item copy dropped'))
    if gap:
        if abs(gap) <= ROUNDING_LIMIT:
            lines.append(('Round Off', -gap))
            fixes.append(Fix('rounding', v.kind, v.number, -gap))
        else:
            lines.append((DIFF_LEDGER, -gap))
            fixes.append(Fix('difference', v.kind, v.number, -gap, 'Marg\'s lines do not add up (freight or charges not in the export?)'))
    return Entry(v=v, lines=[(n, cents(a)) for n, a in lines if a], dropped=dropped)


# ── ledger lookup ────────────────────────────────────────────────────────────────────────────────────────────────

class Ledgers:
    """Find the ledger Phase 2 made for a Marg ledger name (merged ones under MediFlow's own name)."""

    def __init__(self, outlet):
        self.outlet = outlet
        self.by_norm = {norm(l.name): l for l in Ledger.objects.filter(outlet=outlet).select_related('group', 'linked_customer', 'linked_distributor')}
        self.builtin = {app_key(l.name): l for l in builtin_ledgers(outlet).select_related('group')}
        self.missing = Counter()

    def get(self, name):
        l = self.by_norm.get(norm(name)) or self.builtin.get(app_key(name))
        if l is None and name_key(name) in PAYMENT_LEDGERS:
            l = self.builtin.get(app_key(PAYMENT_LEDGERS[name_key(name)]))
        if l is None:
            self.missing[name] += 1
        return l

    def special(self, name):
        if name == DIFF_LEDGER and norm(name) not in self.by_norm:
            group = LedgerGroup.objects.get(outlet=self.outlet, name='Suspense Account')
            self.by_norm[norm(name)] = Ledger.objects.create(outlet=self.outlet, name=name, group=group, balance_type='Dr', is_system=False)
        return self.get(name)


def tender(ledger) -> str:
    """How a bill was paid, from the ledger it was charged to."""
    if ledger.group.name == 'Cash in Hand':
        return 'cash'
    if ledger.name == 'UPI Collections':
        return 'upi'
    if ledger.name == 'Card/POS Settlement':
        return 'card'
    if ledger.group.name in ('Bank Accounts', 'Bank OD'):
        return 'bank_transfer'
    return 'credit'


# ── the plan ─────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class Books:
    outlet: object
    entries: list = field(default_factory=list)
    fixes: list = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)
    marg_totals: dict = field(default_factory=dict)

    def of(self, kind):
        return [f for f in self.fixes if f.kind == kind]


def build_books(outlet, vouchers) -> Books:
    books = Books(outlet=outlet)
    for v in vouchers:
        if v.kind not in SALE_KINDS + BUY_KINDS + tuple(VOUCHER_KINDS):
            raise ValueError(f'Unknown Marg voucher type "{v.kind}" ({v.number}).')
        books.counts[v.kind] += 1
        books.entries.append(journal_lines(v, books.fixes))
    sales = [v for v in vouchers if v.kind == 'Sales']
    books.marg_totals = {
        'sales_billed': sum((-a for v in sales for _, a in v.lines if a < 0), ZERO),
        'sales_gst': sum((a for v in sales for n, a in v.lines if tax_kind(n)), ZERO),
        'purchases_billed': sum((a for v in vouchers if v.kind == 'Purchase' for n, a in v.lines if norm(n) == norm(v.party) and a > 0), ZERO),
    }
    return books


# ── write ────────────────────────────────────────────────────────────────────────────────────────────────────────

def _staff(outlet):
    order = {'super_admin': 0, 'admin': 1, 'manager': 2}
    staff = sorted(Staff.objects.filter(outlet=outlet, is_active=True), key=lambda s: (order.get(s.role, 9), s.name))
    if not staff:
        from .apply import ImportRefused
        raise ImportRefused('The outlet has no active staff to put on the old bills.')
    return staff[0]


class History:
    """One switched-off, empty batch per product for the lines of old bills."""

    def __init__(self, outlet):
        self.outlet = outlet
        self.products = defaultdict(list)
        for p in MasterProduct.objects.all():
            self.products[name_key(p.name)].append(p)
        here = set(Batch.objects.filter(outlet=outlet).values_list('product_id', flat=True))
        for k, ps in self.products.items():
            ps.sort(key=lambda p: p.id not in here)
        self.batches = {b.product_id: b for b in Batch.objects.filter(outlet=outlet, batch_no=HISTORY_BATCH)}
        self.missing = Counter()

    def product(self, name):
        ps = self.products.get(name_key(name))
        if not ps:
            self.missing[name] += 1
            return None
        return ps[0]

    def batch(self, product):
        b = self.batches.get(product.id)
        if b is None:
            b = self.batches[product.id] = Batch.objects.create(
                outlet=self.outlet, product=product, batch_no=HISTORY_BATCH, expiry_date=rules.NO_EXPIRY, mrp=product.mrp or ZERO,
                purchase_rate=ZERO, pack_size=1, pack_unit=product.pack_unit or 'piece', pack_type=product.pack_type or 'piece',
                qty_strips=0, qty_loose=0, is_active=False, is_opening_stock=False)
        return b


def _items(entry, history, total_tax_by_rate):
    """The bill's item lines: taxable = Marg's amount; the bill's tax per rate is spread over the items of that rate."""
    v = entry.v
    rows = []
    for i, it in enumerate(v.items):
        product = history.product(it.name)
        if product is None:
            continue
        rate, inter = item_rate(it)
        if i in entry.dropped or v.amount_layout or not it.tax_class:
            rate, inter = ZERO, False
        rows.append(dict(item=it, product=product, rate=rate, inter=inter, taxable=cents(abs(it.amount)), gst=ZERO))
    for rate, tax in total_tax_by_rate.items():
        group = [r for r in rows if r['rate'] == rate] or ([max(rows, key=lambda r: r['taxable'])] if rows else [])
        for r, g in zip(group, share(tax, [r['taxable'] for r in group])):
            r['gst'] += g
            if r['rate'] != rate:     # tax Marg charged at a rate none of the items carries: shown on the biggest line
                r['rate'] = rate
    return rows


def _split_tax(r):
    if r['inter']:
        return ZERO, ZERO, r['gst']
    half = cents(r['gst'] / 2)
    return half, r['gst'] - half, ZERO


def write_books(books: Books, ledgers: Ledgers, history: History) -> dict:
    from apps.accounts.models import DebitNote, DebitNoteItem
    from apps.billing.models import SaleInvoice, SaleItem, SalesReturn, SalesReturnItem
    from apps.purchases.models import Distributor, PurchaseInvoice, PurchaseItem

    outlet, staff = books.outlet, _staff(books.outlet)
    customers_by_phone = {c.phone: c for c in Customer.objects.filter(outlet=outlet)}
    suppliers = {norm(d.name): d for d in Distributor.objects.filter(outlet=outlet)}
    noon = time(12, 0)
    used_voucher_nos = set()
    out = defaultdict(list)
    journal = []         # (JournalEntry, [(ledger, dr, cr)])

    def supplier_for(party):
        d = suppliers.get(norm(party))
        if d is None:
            name = 'CASH PURCHASE' if norm(party) == 'CASH' else party
            d = suppliers.get(norm(name)) or Distributor.objects.create(outlet=outlet, name=name[:255], is_active=True, state='Maharashtra', state_code='27')
            suppliers[norm(party)] = suppliers[norm(name)] = d
        return d

    for entry in books.entries:
        v = entry.v
        jlines = []
        for name, amount in entry.lines:
            l = ledgers.special(name) if name == DIFF_LEDGER else ledgers.get(name)
            if l is not None:
                jlines.append((l, -amount if amount < 0 else ZERO, amount if amount > 0 else ZERO))
        tax = Counter()
        cgst = sgst = igst = ZERO
        for n, a in v.lines:
            k = tax_kind(n)
            if k:
                signed = a if v.kind in ('Sales', 'Purchase Return') else -a
                tax[k[1]] += signed
                cgst, sgst, igst = cgst + (signed if k[0] == 'C' else 0), sgst + (signed if k[0] == 'S' else 0), igst + (signed if k[0] == 'I' else 0)
        gst = cgst + sgst + igst
        day = v.day

        if v.kind == 'Sales':
            paid = Counter()
            customer = None
            for l, dr, cr in jlines:
                if dr and l.name not in ('Round Off', DIFF_LEDGER) and not tax_kind(l.name) and l.group.nature in ('asset', 'liability'):
                    paid[tender(l)] += dr
                    customer = customer or l.linked_customer
            grand = sum(paid.values(), ZERO)
            got = note_party(v.note)
            if customer is None and got:
                customer = customers_by_phone.get(got[0])
            taxable = sum((cr - dr for l, dr, cr in jlines if l.group.nature == 'income' and l.name not in ('Round Off',) and not tax_kind(l.name)), ZERO)
            modes = [m for m, a in paid.items() if a]
            inv = SaleInvoice(
                outlet=outlet, invoice_no=v.number[:50], invoice_date=datetime.combine(day, noon), customer=customer, billed_by=staff,
                sale_type='RETAIL', billing_basis='MRP', is_interstate=igst > 0, payment_mode=modes[0] if len(modes) == 1 else ('split' if modes else 'cash'),
                subtotal=taxable, taxable_amount=taxable, cgst_amount=cgst, sgst_amount=sgst, igst_amount=igst,
                round_off=grand - taxable - gst, grand_total=grand, cash_paid=paid['cash'], upi_paid=paid['upi'], card_paid=paid['card'] + paid['bank_transfer'],
                credit_given=paid['credit'], amount_paid=grand - paid['credit'], amount_due=paid['credit'], walk_in_name=(got[1] if got and not customer else '')[:255],
            )
            out['sales'].append(inv)
            for r in _items(entry, history, tax):
                it, c, s, i_ = r['item'], *_split_tax(r)
                qty = int(abs(it.billed)) or 1
                total = r['taxable'] + r['gst']
                out['sale_items'].append(SaleItem(
                    invoice=inv, batch=history.batch(r['product']), product_name=r['product'].name[:255], composition=r['product'].composition or '',
                    pack_size=1, pack_unit=r['product'].pack_unit or 'piece', schedule_type=r['product'].schedule_type or 'OTC',
                    batch_no=(it.batch or rules.NO_BATCH)[:100], expiry_date=rules.NO_EXPIRY, mrp=cents(it.rate), sale_rate=cents(total / qty),
                    rate=cents(r['taxable'] / qty), unit_rate=cents(total / qty), qty_strips=qty, qty_loose=0, gst_rate=r['rate'],
                    taxable_amount=r['taxable'], gst_amount=r['gst'], total_amount=total, hsn_code=r['product'].hsn_code,
                    cgst_amount=c, sgst_amount=s, igst_amount=i_, cgst_rate=ZERO if r['inter'] else r['rate'] / 2,
                    sgst_rate=ZERO if r['inter'] else r['rate'] / 2, igst_rate=r['rate'] if r['inter'] else ZERO,
                ))
            journal.append((JournalEntry(outlet=outlet, source_type='SALE', source_id=inv.id, date=day, narration=v.note or f'Sale {v.number}'), jlines))

        elif v.kind == 'Sale Return':
            refund = [(l, cr) for l, dr, cr in jlines if cr and l.group.nature in ('asset', 'liability') and not tax_kind(l.name) and l.name not in ('Round Off', DIFF_LEDGER)]
            total = sum((a for _, a in refund), ZERO)
            mode = tender(refund[0][0]) if refund else 'cash'
            ret = SalesReturn(outlet=outlet, return_no=v.number[:100], return_date=day, reason=f'Marg sale return {v.number}. {v.note}'.strip(),
                              total_amount=total, refund_mode={'cash': 'cash', 'upi': 'upi', 'card': 'upi', 'bank_transfer': 'upi'}.get(mode, 'credit_note'),
                              original_sale=None, manual_override=True, created_by=staff)
            out['returns'].append(ret)
            for r in _items(entry, history, tax):
                it = r['item']
                qty = int(abs(it.billed)) or 1
                out['return_items'].append(SalesReturnItem(
                    sales_return=ret, batch=history.batch(r['product']), product_name=r['product'].name[:255], batch_no=(it.batch or rules.NO_BATCH)[:100],
                    qty_returned=qty, qty_returned_strips=qty, return_rate=cents((r['taxable'] + r['gst']) / qty), total_amount=r['taxable'] + r['gst']))
            journal.append((JournalEntry(outlet=outlet, source_type='RETURN', source_id=ret.id, date=day, narration=v.note or f'Sale return {v.number}'), jlines))

        elif v.kind == 'Purchase':
            party = next((a for n, a in v.lines if norm(n) == norm(v.party)), ZERO)
            grand = party if party > 0 else sum((cr for l, dr, cr in jlines if cr and l.group.nature in ('asset', 'liability') and not tax_kind(l.name)), ZERO)
            taxable = sum((dr - cr for l, dr, cr in jlines if l.group.nature == 'expense' and l.name != 'Round Off'), ZERO)
            extra = sum((dr - cr for l, dr, cr in jlines if l.name == DIFF_LEDGER), ZERO)   # what Marg's bill holds beyond goods + tax
            inv = PurchaseInvoice(
                outlet=outlet, distributor=supplier_for(v.party), invoice_no=v.number[:100], invoice_date=day, status='POSTED', godown='main',
                purchase_type='cash' if norm(v.party) == 'CASH' else 'credit', subtotal=taxable, taxable_amount=taxable, gst_amount=gst,
                round_off=grand - taxable - gst - extra, ledger_adjustment=extra, ledger_note='Difference in Marg\'s own bill' if extra else None,
                grand_total=grand, amount_paid=grand, outstanding=ZERO, notes=v.note, created_by=staff)
            out['purchases'].append(inv)
            for r in _items(entry, history, tax):
                it, c, s, i_ = r['item'], *_split_tax(r)
                billed, actual = int(abs(it.billed)), int(abs(it.actual))
                out['purchase_items'].append(PurchaseItem(
                    invoice=inv, batch=history.batch(r['product']), master_product=r['product'], hsn_code=r['product'].hsn_code,
                    batch_no=(it.batch or rules.NO_BATCH)[:100], expiry_date=rules.NO_EXPIRY, pkg=1, qty=billed, actual_qty=actual,
                    free_qty=max(actual - billed, 0), purchase_rate=cents(it.rate), discount_pct=it.discount, gst_rate=r['rate'],
                    mrp=r['product'].mrp or ZERO, ptr=cents(it.rate), pts=cents(it.rate), taxable_amount=r['taxable'], gst_amount=r['gst'],
                    total_amount=r['taxable'] + r['gst'], landing_rate=cents((r['taxable'] + r['gst']) / actual) if actual else ZERO))
            journal.append((JournalEntry(outlet=outlet, source_type='PURCHASE', source_id=inv.id, date=day, narration=v.note or f'Purchase {v.number}'), jlines))

        elif v.kind == 'Purchase Return':
            total = sum((dr for l, dr, cr in jlines if dr and norm(l.name) == norm(v.party)), ZERO)
            note = DebitNote(outlet=outlet, debit_note_no=v.number[:50], date=day, distributor=supplier_for(v.party), reason=f'Marg purchase return {v.number}. {v.note}'.strip(),
                             subtotal=total - gst, gst_amount=gst, total_amount=total, status='adjusted', created_by=staff)
            out['debit_notes'].append(note)
            for r in _items(entry, history, tax):
                qty = int(abs(r['item'].billed)) or 1
                out['debit_note_items'].append(DebitNoteItem(debit_note=note, batch=history.batch(r['product']), product_name=r['product'].name[:255],
                                                             qty=qty, rate=cents(r['taxable'] / qty), total=r['taxable']))
            journal.append((JournalEntry(outlet=outlet, source_type='RETURN', source_id=note.id, date=day, narration=v.note or f'Purchase return {v.number}'), jlines))

        else:
            no = v.number[:50] or f'MARG-{len(used_voucher_nos) + 1}'
            if no.upper() in used_voucher_nos:
                base, n = f'{no[:45]}-{v.kind[0]}', 1
                no = base
                while no.upper() in used_voucher_nos:
                    n += 1
                    no = f'{base}{n}'
                books.fixes.append(Fix('renumbered', v.kind, v.number, ZERO, f'Marg uses {v.number} twice; this one is {no}'))
            used_voucher_nos.add(no.upper())
            bank = any(l.group.name in ('Bank Accounts', 'Bank OD') for l, _, _ in jlines)
            vou = Voucher(outlet=outlet, voucher_type=VOUCHER_KINDS[v.kind], voucher_no=no, date=day, narration=v.note, status='posted',
                          total_amount=sum((dr for _, dr, _ in jlines), ZERO), payment_mode='bank' if bank else 'cash', created_by=staff)
            out['vouchers'].append(vou)
            out['voucher_lines'] += [VoucherLine(voucher=vou, ledger=l, debit=dr, credit=cr, description='') for l, dr, cr in jlines]
            journal.append((JournalEntry(outlet=outlet, source_type='VOUCHER', source_id=vou.id, date=day, narration=v.note or f'{v.kind} {no}'), jlines))

    from .apply import ImportRefused
    if ledgers.missing:
        raise ImportRefused(f'Marg ledgers with no ledger here (run Phase 2 first): {dict(ledgers.missing.most_common(8))}')
    if history.missing:
        raise ImportRefused(f'Marg items with no product here (run Phase 1 first): {dict(history.missing.most_common(8))}')

    for key, model in (('sales', SaleInvoice), ('sale_items', SaleItem), ('returns', SalesReturn), ('return_items', SalesReturnItem),
                       ('purchases', PurchaseInvoice), ('purchase_items', PurchaseItem), ('debit_notes', DebitNote), ('debit_note_items', DebitNoteItem),
                       ('vouchers', Voucher), ('voucher_lines', VoucherLine)):
        model.objects.bulk_create(out[key], batch_size=1000)
    JournalEntry.objects.bulk_create([je for je, _ in journal], batch_size=1000)
    JournalLine.objects.bulk_create([JournalLine(journal_entry=je, ledger=l, debit_amount=dr, credit_amount=cr) for je, ls in journal for l, dr, cr in ls], batch_size=2000)
    return {k: len(v) for k, v in out.items()} | {'journal_entries': len(journal)}


def settle(outlet) -> dict:
    """After the load: every ledger's balance, what each credit customer owes, and which purchase bills are still unpaid."""
    from apps.billing.models import SaleInvoice
    from apps.purchases.models import PurchaseInvoice
    sums = {r['ledger_id']: r for r in JournalLine.objects.filter(journal_entry__outlet=outlet).values('ledger_id').annotate(dr=Sum('debit_amount'), cr=Sum('credit_amount'))}
    balances = {}
    for l in Ledger.objects.filter(outlet=outlet).select_related('group'):
        s = sums.get(l.id, {'dr': ZERO, 'cr': ZERO})
        nat = natural_balance(l.opening_balance, l.balance_type, l.group.nature)
        move = (s['dr'] or ZERO) - (s['cr'] or ZERO)
        l.current_balance = nat + (move if l.group.nature in ('asset', 'expense') else -move)
        balances[l.id] = l
    Ledger.objects.bulk_update(balances.values(), ['current_balance'], batch_size=500)

    stats = {r['customer_id']: r for r in SaleInvoice.objects.filter(outlet=outlet, customer__isnull=False).values('customer_id').annotate(n=Count('id'), t=Sum('grand_total'))}
    owed = {l.linked_customer_id: max(l.current_balance, ZERO) for l in balances.values() if l.linked_customer_id and l.group.name == 'Sundry Debtors'}
    custs = list(Customer.objects.filter(outlet=outlet))
    for c in custs:
        st = stats.get(c.id, {'n': 0, 't': ZERO})
        c.total_visits, c.total_purchases, c.outstanding = st['n'], st['t'] or ZERO, owed.get(c.id, ZERO)
    Customer.objects.bulk_update(custs, ['total_visits', 'total_purchases', 'outstanding'], batch_size=1000)

    # a supplier's closing balance is what is still unpaid: the newest bills carry it
    owe = {l.linked_distributor_id: l.current_balance for l in balances.values() if l.linked_distributor_id}
    bills = defaultdict(list)
    for p in PurchaseInvoice.objects.filter(outlet=outlet).order_by('-invoice_date', '-invoice_no'):
        bills[p.distributor_id].append(p)
    changed, unpaid = [], ZERO
    for dist, ps in bills.items():
        left = max(owe.get(dist, ZERO), ZERO)
        for p in ps:
            p.outstanding = min(p.grand_total, left) if left > 0 else ZERO
            p.amount_paid = p.grand_total - p.outstanding
            left -= p.outstanding
            unpaid += p.outstanding
            changed.append(p)
    PurchaseInvoice.objects.bulk_update(changed, ['outstanding', 'amount_paid'], batch_size=500)
    return {'customers_owing': sum(1 for v in owed.values() if v > 0), 'customer_dues': sum(owed.values(), ZERO),
            'supplier_dues_on_bills': unpaid, 'supplier_dues_in_ledgers': sum((max(v, ZERO) for v in owe.values()), ZERO)}


def purge_books(outlet) -> dict:
    """Run again safely: the outlet's documents and journal go (Phase 2's delete list), and so do the history batches."""
    from django.apps import apps as django_apps
    from .parties import PURGE
    done = Counter()
    for label, path in PURGE:
        _, per = django_apps.get_model(label)._base_manager.filter(**{path: outlet}).delete()
        done.update(per)
    from apps.accounts.models import DebitNote
    _, per = DebitNote.objects.filter(outlet=outlet).delete()
    done.update(per)
    _, per = Batch.objects.filter(outlet=outlet, batch_no=HISTORY_BATCH, is_active=False).delete()
    done.update(per)
    return dict(done)


def verify(books: Books) -> dict:
    from apps.billing.models import SaleInvoice, SalesReturn
    from apps.purchases.models import PurchaseInvoice
    from apps.accounts.models import DebitNote
    from .apply import ImportRefused
    outlet, problems = books.outlet, []
    have = {'Sales': SaleInvoice.objects.filter(outlet=outlet).count(), 'Sale Return': SalesReturn.objects.filter(outlet=outlet).count(),
            'Purchase': PurchaseInvoice.objects.filter(outlet=outlet).count(), 'Purchase Return': DebitNote.objects.filter(outlet=outlet).count()}
    for kind, vt in VOUCHER_KINDS.items():
        have[kind] = Voucher.objects.filter(outlet=outlet, voucher_type=vt).count()
    if {k: n for k, n in have.items() if n} != {k: n for k, n in books.counts.items() if n}:
        problems.append(f'documents: database {have}, Marg {dict(books.counts)}')
    if JournalEntry.objects.filter(outlet=outlet).count() != sum(books.counts.values()):
        problems.append('not one journal entry per Marg voucher')
    lop = (JournalLine.objects.filter(journal_entry__outlet=outlet).values('journal_entry_id').annotate(dr=Sum('debit_amount'), cr=Sum('credit_amount'))
           .exclude(dr=models_F('cr')).count())
    if lop:
        problems.append(f'{lop} journal entries whose debits and credits differ')
    sales = SaleInvoice.objects.filter(outlet=outlet).aggregate(g=Sum('grand_total'), c=Sum('cgst_amount'), s=Sum('sgst_amount'), i=Sum('igst_amount'))
    if sales['g'] != cents(books.marg_totals['sales_billed']):
        problems.append(f"sales billed {sales['g']}, Marg {books.marg_totals['sales_billed']}")
    if (sales['c'] or 0) + (sales['s'] or 0) + (sales['i'] or 0) != cents(books.marg_totals['sales_gst']):
        problems.append(f"sales GST differs from Marg's tax ledgers")
    item_gst = SaleInvoice.objects.filter(outlet=outlet).aggregate(t=Sum('items__gst_amount'))['t'] or ZERO
    bill_gst = (sales['c'] or 0) + (sales['s'] or 0) + (sales['i'] or 0)
    if problems:
        raise ImportRefused('The result does not add up: ' + '; '.join(problems))
    return {**{f'{k.lower()}': n for k, n in have.items()}, 'sales_billed': sales['g'], 'sales_gst': bill_gst,
            'sales_gst_on_item_lines': item_gst, 'purchases_billed': PurchaseInvoice.objects.filter(outlet=outlet).aggregate(g=Sum('grand_total'))['g']}


def models_F(name):
    from django.db.models import F
    return F(name)
