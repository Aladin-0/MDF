"""
The Excel file for the shop: what the load will do, and the short lists only they can settle. The yellow columns are
theirs to fill; `read_answers` reads the same file back, so the lists and the answers never drift apart.
"""
from collections import Counter
from decimal import Decimal, InvalidOperation

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill

from apps.inventory import xlsx_helpers as xl

from . import plan as P
from .plan import Answers, Plan, batch_key
from .rules import name_key

_FILL = PatternFill('solid', fgColor='FEF3C7')
ASK = 'FILL IN: '      # a header that starts with this is a column the shop answers

# sheet title -> (key columns, {answer header: which answer it feeds})
SHEET_MRP = 'MRP missing'
SHEET_COST = 'Cost above MRP'
SHEET_QTY = 'Part quantity'
SHEET_PIECE = 'Cost per piece'
SHEET_TAX = 'HSN or GST missing'
A_MRP, A_COST, A_LOOSE, A_PACK, A_HSN, A_GST = (ASK + s for s in (
    'correct MRP of one pack', 'correct cost of one pack', 'loose pieces on the shelf', 'pieces in one pack', 'HSN code', 'GST %'))


def _table(wb, title, intro, headers, rows, widths, money=(), right=()):
    ws = wb.create_sheet(title[:31])
    xl.title_block(ws, title, intro, f'{len(rows)} row(s).' + ('  Fill in the yellow columns.' if any(h.startswith(ASK) for h in headers) else ''))
    xl.header(ws, 4, headers, widths, right=right)
    for r, row in enumerate(rows, start=5):
        for c, v in enumerate(row, start=1):
            ws.cell(row=r, column=c, value=xl.safe(v) if isinstance(v, str) else (float(v) if isinstance(v, Decimal) else v))
    last = 4 + len(rows)
    xl.style_cells(ws, 5, last, {c: xl.MONEY for c in money}, right=right)
    for c, h in enumerate(headers, start=1):
        if h.startswith(ASK):
            ws.cell(row=4, column=c).fill = PatternFill('solid', fgColor='B45309')
            for r in range(5, last + 1):
                ws.cell(row=r, column=c).fill = _FILL
    xl.finish(ws, 4, last, len(headers), freeze_cols=1)
    return ws


def _stock_text(row):
    """The stock number as Marg prints it (a number, so Excel keeps "98.86" and "-8" as they are)."""
    return float(row.stock)


def write_workbook(plan: Plan, path, result: dict | None = None) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    t = plan.totals()
    xl.title_block(ws, f'Marg stock load: {plan.outlet.name}', f'Stock report of {plan.sheet.company} as on {plan.sheet.as_on:%d-%b-%Y}',
                   'Show-only run: nothing was saved.' if result is None or not result.get('saved') else 'Saved.')
    lines = [
        ('WHAT WILL BE LOADED', ''),
        ('Stock rows in the report', len(plan.sheet.rows)),
        ('Batches that will be created', t['batches']),
        ('Products in stock', t['products_in_stock']),
        ('Whole packs', t['whole_packs']),
        ('Loose pieces', t['loose_units']),
        ('Stock value at landing cost', t['landing_value']),
        ("The report's own value for the same rows", t['sheet_value_of_loaded_rows']),
        ("The report's grand total (all rows)", plan.sheet.total_value),
        ('Batches with a real expiry date', t['with_expiry']),
        ('   of them already expired on the report date', t['already_expired']),
        ('', ''),
        ('PRODUCT LIST', ''),
        ('Products to add', t['products_to_create']),
        ('Products to correct (HSN, GST, pack, maker)', t['products_to_update']),
        ('Items under two spellings in the catalogue', sum(1 for p in plan.products.values() if p.twins)),
        ('', ''),
        ('FOR THE SHOP TO SETTLE', ''),
        (f'{SHEET_MRP} (blocks the real load)', len(plan.of(P.MRP_MISSING))),
        (f'{SHEET_QTY} not clear (blocks the real load)', len(plan.of(P.QTY_UNCLEAR))),
        (SHEET_COST, len(plan.of(P.COST_ABOVE_MRP))),
        (f'{SHEET_PIECE} instead of per pack', len(plan.of(P.COST_PER_PIECE))),
        (SHEET_TAX, len(plan.of(P.TAX_MISSING))),
        ('Negative stock rows (not loaded)', len(plan.of(P.NEGATIVE_STOCK))),
    ]
    for r, (label, value) in enumerate(lines, start=4):
        ws.cell(row=r, column=1, value=label).font = Font(bold=not str(value) and bool(label))
        c = ws.cell(row=r, column=2, value=float(value) if isinstance(value, Decimal) else value)
        if isinstance(value, Decimal):
            c.number_format = xl.MONEY
    ws.column_dimensions['A'].width, ws.column_dimensions['B'].width = 52, 20
    for r, note in enumerate(plan.notes, start=len(lines) + 6):
        ws.cell(row=r, column=1, value=xl.safe(note)).font = xl.MUTED

    _table(wb, SHEET_MRP, 'The report has no MRP for these. Without it the batch cannot be billed.',
           ['Product', 'Batch', 'Stock (as Marg prints it)', 'Cost of one pack', 'Excel row', A_MRP],
           [(i.row.name, i.row.batch, _stock_text(i.row), i.row.cost, i.row.line, None) for i in plan.of(P.MRP_MISSING)],
           [44, 18, 16, 16, 10, 22], money=(4,), right=(3, 4, 5, 6))
    _table(wb, SHEET_COST, 'The cost is higher than the MRP. One of the two is wrong; MediFlow will not sell below cost.',
           ['Product', 'Batch', 'Stock (as Marg prints it)', 'Cost of one pack', 'MRP', 'Excel row', A_MRP, A_COST],
           [(i.row.name, i.row.batch, _stock_text(i.row), i.detail['landing'], i.detail['mrp'], i.row.line, None, None) for i in plan.of(P.COST_ABOVE_MRP)],
           [44, 18, 16, 16, 14, 10, 22, 22], money=(4, 5), right=(3, 4, 5, 6, 7, 8))
    _table(wb, SHEET_QTY, 'Marg prints packs.loose and drops a last zero, so these cannot be read for sure. Only the whole packs are loaded until answered.',
           ['Product', 'Batch', 'Marg prints', 'Pieces in one pack (Marg)', 'Whole packs loaded', 'It could mean (loose pieces)', 'Excel row', A_LOOSE, A_PACK],
           [(i.row.name, i.row.batch, _stock_text(i.row), i.detail['pack_size'] if i.detail['pack_size'] > 1 else 'not set in Marg', i.detail['packs'],
             ' or '.join(str(c) for c in i.detail['choices']) or 'cannot tell', i.row.line, None, None) for i in plan.of(P.QTY_UNCLEAR)],
           [44, 18, 12, 16, 12, 22, 10, 22, 20], right=(3, 4, 5, 7, 8, 9))
    _table(wb, SHEET_PIECE, 'A whole pack at this cost would still be under the MRP of one pack: the cost looks typed per piece.',
           ['Product', 'Batch', 'Pieces in one pack', 'Cost in Marg', 'MRP of one pack', 'Excel row', A_COST],
           [(i.row.name, i.row.batch, i.detail['pack_size'], i.detail['landing'], i.detail['mrp'], i.row.line, None) for i in plan.of(P.COST_PER_PIECE)],
           [44, 18, 12, 14, 14, 10, 24], money=(4, 5), right=(3, 4, 5, 6, 7))
    _table(wb, SHEET_TAX, 'Marg has no HSN or no GST rate for these items. What the catalogue shows now is kept until answered.',
           ['Product', 'In stock now', 'HSN in Marg', 'GST % in Marg', 'HSN in MediFlow now', 'GST % in MediFlow now', A_HSN, A_GST],
           [(i.product, 'yes' if i.detail['in_stock'] else 'no', i.detail['hsn'], i.detail['gst'], i.detail['catalogue_hsn'] or '', i.detail['catalogue_gst'], None, None)
            for i in sorted(plan.of(P.TAX_MISSING), key=lambda i: (not i.detail['in_stock'], i.product))],
           [44, 12, 12, 12, 16, 16, 16, 12], right=(3, 4, 5, 6, 7, 8))
    _table(wb, 'Negative stock', 'Marg shows less than zero. These rows are not loaded.',
           ['Product', 'Batch', 'Stock in Marg', 'Value in Marg', 'Excel row'],
           [(i.row.name, i.row.batch, _stock_text(i.row), i.row.value, i.row.line) for i in plan.of(P.NEGATIVE_STOCK)],
           [44, 18, 14, 14, 10], money=(4,), right=(3, 4, 5))

    def was(pp, f):
        return pp.changes[f][0] if f in pp.changes else getattr(pp.product, f)

    packs = [pp for pp in plan.products.values() if any(f in pp.changes for f in ('pack_size', 'pack_unit', 'pack_type'))]
    _table(wb, 'Pack changes', 'Products whose pack will be corrected. Check the ones that are not a single piece.',
           ['Product', 'In stock now', 'Pack now', 'Pack after', 'Size comes from'],
           [(pp.name, 'yes' if pp.in_stock else 'no', f"{was(pp, 'pack_size')} {was(pp, 'pack_unit')} / {was(pp, 'pack_type')}",
             f'{pp.pack.size} {pp.pack.unit} / {pp.pack.type}', {'Marg': "Marg's own pack number", 'catalogue': 'already in MediFlow', 'single': 'sold one by one'}[pp.pack_source])
            for pp in sorted(packs, key=lambda p: (p.pack.size == 1, p.name))],
           [48, 12, 24, 24, 24])
    tax = [pp for pp in plan.products.values() if 'hsn_code' in pp.changes or 'gst_rate' in pp.changes]
    _table(wb, 'Tax changes', 'Marg and MediFlow disagree; Marg is the shop\'s current book, so its value will be used.',
           ['Product', 'In stock now', 'HSN now', 'HSN after', 'GST % now', 'GST % after'],
           [(pp.name, 'yes' if pp.in_stock else 'no', was(pp, 'hsn_code') or '', pp.changes.get('hsn_code', (None, was(pp, 'hsn_code')))[1],
             was(pp, 'gst_rate'), pp.changes.get('gst_rate', (None, was(pp, 'gst_rate')))[1]) for pp in sorted(tax, key=lambda p: p.name)],
           [48, 12, 12, 12, 12, 12], right=(3, 4, 5, 6))
    _table(wb, 'New products', 'In Marg but not in MediFlow. They will be added.',
           ['Product', 'In stock now', 'Company', 'HSN', 'GST %', 'Pack'],
           [(pp.name, 'yes' if pp.in_stock else 'no', pp.create['manufacturer'], pp.create['hsn_code'] or '', pp.create['gst_rate'],
             f'{pp.pack.size} {pp.pack.unit} / {pp.pack.type}') for pp in sorted((p for p in plan.products.values() if p.create), key=lambda p: p.name)],
           [48, 12, 28, 10, 10, 22], right=(4, 5))
    _table(wb, 'Two spellings', 'The same item twice in the catalogue. Stock goes on the first; the other is cleaned up once old bills are reloaded.',
           ['Used for stock', 'Other spelling', 'Used by another outlet'],
           [(pp.name, tw.name, 'yes' if pp.shared else 'no') for pp in sorted(plan.products.values(), key=lambda p: p.name) for tw in pp.twins],
           [50, 50, 20])
    wb.save(path)


# ── reading the answers back ─────────────────────────────────────────────────────────────────────────────────────

def _number(v) -> Decimal | None:
    if v in (None, ''):
        return None
    try:
        d = Decimal(str(v).replace(',', '').replace('%', '').strip())
    except InvalidOperation:
        return None
    return d if d >= 0 else None


def read_answers(path) -> Answers:
    """Only cells the shop filled in count. A blank, or something that is not a number, is "no answer": never a zero."""
    a = Answers()
    wb = load_workbook(path, data_only=True)

    def rows(title):
        if title[:31] not in wb.sheetnames:
            return
        ws = wb[title[:31]]
        heads = {str(c.value): i for i, c in enumerate(ws[4]) if c.value}
        for r in ws.iter_rows(min_row=5, values_only=True):
            if r and r[0]:
                yield {h: r[i] for h, i in heads.items() if i < len(r)}

    for title in (SHEET_MRP, SHEET_COST, SHEET_PIECE, SHEET_QTY):
        for r in rows(title):
            key = batch_key(r['Product'], r.get('Batch') or '')
            mrp, cost, loose, pack = (_number(r.get(h)) for h in (A_MRP, A_COST, A_LOOSE, A_PACK))
            if mrp:
                a.mrp[key] = mrp
            if cost:
                a.cost[key] = cost
            if pack and pack == pack.to_integral_value() and pack > 1:
                a.pack_size[key[0]] = int(pack)
            if loose is not None and loose == loose.to_integral_value():
                a.loose[key] = int(loose)
    for r in rows(SHEET_TAX):
        hsn, gst = str(r.get(A_HSN) or '').strip(), _number(r.get(A_GST))
        if hsn.endswith('.0'):
            hsn = hsn[:-2]
        if hsn or gst is not None:
            a.tax[name_key(r['Product'])] = (hsn, gst)
    return a


# ── Phase 2: parties and opening balances ─────────────────────────────────────────────────────────────────────────

def write_party_workbook(plan, path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    t = plan.totals()
    xl.title_block(ws, f'Marg ledgers and parties: {plan.outlet.name}', 'Opening balances as on 1 April (Marg "All Masters").', '')
    lines = [
        ('Ledgers from Marg', t['ledgers']), ('   merged into a MediFlow ledger of the same kind', t['merged_into_builtin']),
        ('Marg groups kept as sub-groups', t['subgroups']), ('Suppliers', t['suppliers']),
        ('Customers from Marg ledgers (credit customers)', t['customers_from_ledgers']),
        ('Customers from the mobile numbers on bills', t['customers_from_bill_notes']),
        ('Opening balances: total Dr', t['opening_dr']), ('Opening balances: total Cr', t['opening_cr']),
        ('Stock batches given their supplier', t['batches_given_a_supplier']),
    ]
    for r, (label, value) in enumerate(lines, start=4):
        ws.cell(row=r, column=1, value=label)
        c = ws.cell(row=r, column=2, value=float(value) if isinstance(value, Decimal) else value)
        if isinstance(value, Decimal):
            c.number_format = xl.MONEY
    ws.column_dimensions['A'].width, ws.column_dimensions['B'].width = 52, 20
    for r, note in enumerate(plan.notes, start=len(lines) + 6):
        ws.cell(row=r, column=1, value=xl.safe(note)).font = xl.MUTED

    _table(wb, 'Where ledgers go', 'Each Marg group and the MediFlow group its ledgers are put in.',
           ['Marg group', 'MediFlow group', 'Ledgers'],
           sorted((g, grp, n) for (g, grp), n in Counter((lp.marg.parent, lp.group) for lp in plan.ledgers.values()).items()),
           [40, 40, 10], right=(3,))
    _table(wb, 'Merged ledgers', 'Marg ledgers that become one of MediFlow\'s own ledgers (new bills post to these).',
           ['Marg ledger', 'MediFlow ledger', 'Opening', 'Dr / Cr'],
           [(lp.marg.name, lp.into_builtin, abs(lp.opening), 'Dr' if lp.opening < 0 else 'Cr') for lp in plan.ledgers.values() if lp.into_builtin],
           [40, 30, 16, 10], money=(3,), right=(3,))
    _table(wb, 'Repeated names', 'Marg has these names more than once; bills cannot tell them apart, so each is one ledger.',
           ['Ledger', 'Times in Marg', 'Opening (all copies)'],
           [(lp.marg.name, lp.copies, lp.opening) for lp in plan.ledgers.values() if lp.copies > 1], [44, 14, 18], money=(3,), right=(2, 3))
    _table(wb, 'Credit customers', 'Marg\'s debtor ledgers. A mobile is taken from their bills; TMP- means none was found.',
           ['Customer', 'Mobile', 'GSTIN', 'Owes on 1 April'],
           [(c['name'], c['phone'], c.get('gstin') or '', c.get('outstanding') or 0) for c in plan.customers if c.get('ledger')],
           [44, 16, 18, 16], money=(4,), right=(4,))
    _table(wb, 'Suppliers', 'Marg\'s creditor ledgers.',
           ['Supplier', 'GSTIN', 'State', 'Opening', 'Dr / Cr'],
           [(s['name'], s['gstin'] or '', s['state'], s['opening_balance'], s['balance_type']) for s in plan.suppliers.values()],
           [44, 18, 16, 16, 8], money=(4,), right=(4,))
    _table(wb, 'Stock supplier not found', 'The stock report names these suppliers, but Marg has no supplier ledger by that name.',
           ['Supplier in the stock report', 'Batches'], sorted(plan.unknown_suppliers.items(), key=lambda kv: -kv[1]), [44, 10], right=(2,))
    wb.save(path)


# ── Phase 3: the books ────────────────────────────────────────────────────────────────────────────────────────────

def write_books_workbook(books, checked, dues, path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = 'Summary'
    xl.title_block(ws, f'Marg daybook loaded: {books.outlet.name}', 'Sales, returns, purchases and vouchers, each with its journal entry.', '')
    rows = [(k.replace('_', ' '), v) for k, v in {**checked, **dues}.items()]
    for kind, label in (('rounding', 'Paise round-off added'), ('double', 'Item written twice, copy dropped'),
                        ('difference', 'Did not add up: booked to MARG DIFFERENCE (TO CHECK)'), ('renumbered', 'Voucher number used twice')):
        fx = books.of(kind)
        rows.append((f'{label}: entries', len(fx)))
        rows.append((f'{label}: rupees', sum((abs(f.amount) for f in fx), Decimal('0'))))
    for r, (label, value) in enumerate(rows, start=4):
        ws.cell(row=r, column=1, value=label)
        c = ws.cell(row=r, column=2, value=float(value) if isinstance(value, Decimal) else value)
        if isinstance(value, Decimal):
            c.number_format = xl.MONEY
    ws.column_dimensions['A'].width, ws.column_dimensions['B'].width = 56, 20
    for kind, title, intro in (('difference', 'To check', 'Marg\'s own lines for these entries do not add up. The difference is in the ledger MARG DIFFERENCE (TO CHECK).'),
                               ('double', 'Written twice', 'A tax-free item Marg booked twice. It is kept once, on the tax-free ledger line.'),
                               ('renumbered', 'Renumbered', 'Marg uses the same voucher number twice; MediFlow needs each once.'),
                               ('rounding', 'Rounding', 'Paise Marg did not book; added to Round Off.')):
        _table(wb, title, intro, ['Type', 'Number', 'Rupees', 'Detail'],
               [(f.voucher, f.number, f.amount, f.detail) for f in books.of(kind)], [16, 22, 14, 70], money=(3,), right=(3,))
    wb.save(path)
