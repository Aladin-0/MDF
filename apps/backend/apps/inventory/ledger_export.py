"""
The Stock Ledger as an Excel file an accountant can use: oldest first (so the balance reads downward), real dates and numbers,
the quantity in words AND as a signed number of packs (to sum), the invoice or reason in plain words, money only for people who
may see purchase rates, and a Summary sheet. Same filters as the screen.
"""
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO

import openpyxl

from apps.inventory import ledger_view as lv
from apps.inventory import xlsx_helpers as xh

MAX_ROWS = 50_000
EVENT_FILTER_LABELS = {'PURCHASE_IN': 'Received from a supplier', 'SALE_OUT': 'Sold', 'SALE_RETURN': 'Customer returns', 'PURCHASE_RETURN': 'Returned to a supplier',
                       'ADJUSTMENT_IN': 'Stock added', 'ADJUSTMENT_OUT': 'Written off or removed', 'OPENING': 'Opening stock'}


def _s(n: int, word: str) -> str:
    if not word:
        return str(n)
    plural = '' if word.lower().endswith('s') else 's'
    return f"{n} {word}{'' if n == 1 else plural}"


def packs_words(packs, pack_size, pack_type='', pack_unit='') -> str:
    """Packs (may be fractional) in the batch's own words: '5 strips + 3 tablets'. The same rule as `packsText` on the screen."""
    size = int(pack_size or 1)
    units = int((Decimal(str(abs(packs))) * size).quantize(Decimal('1')))
    if units == 0:
        return '0'
    strips, loose = divmod(units, size)
    t, u = (pack_type or 'strip').lower(), (pack_unit or 'tablet').lower()
    if size <= 1:
        return _s(strips, t) if strips > 0 else _s(loose, u)
    if strips > 0 and loose > 0:
        return f'{_s(strips, t)} + {_s(loose, u)}'
    return _s(strips, t) if strips > 0 else _s(loose, u)


def signed_words(packs, row) -> str:
    text = packs_words(packs, row['pack_size'], row['pack_type'], row['pack_unit'])
    return '0' if text == '0' else f"{'-' if packs < 0 else '+'}{text}"


def build_workbook(entries, *, show_rates: bool, outlet_name: str, filters_line: str, summary: dict, total_records: int, one_pack=None) -> bytes:
    """`entries`: StockLedger rows, oldest first. `one_pack`: the batch's pack when one batch is shown (the Summary then speaks in its words)."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Stock ledger'
    now = datetime.now().strftime('%d %b %Y %H:%M')

    labels = ['Date', 'What happened', 'Customer / supplier', 'Detail', 'Product', 'Batch', 'Expiry', 'Quantity', 'Packs (±)', 'Balance', 'Balance (packs)']
    widths = [14, 24, 26, 36, 34, 14, 14, 22, 11, 22, 13]
    right = {8, 9, 10, 11}                                   # the four quantity columns line up on the right
    formats = {1: xh.DATE, 7: xh.DATE, 9: xh.SIGNED_PACKS, 11: xh.PACKS}
    if show_rates:
        labels.append('Value at cost (±)')
        widths.append(16)
        right.add(len(labels))
        formats[len(labels)] = xh.SIGNED_MONEY
    labels.append('Note')
    widths.append(38)
    ncols = len(labels)

    shown = min(total_records, MAX_ROWS)
    xh.title_block(ws, f'Stock ledger · {outlet_name}', filters_line,
                   f'Generated {now} · {shown:,} movement(s), oldest first' + (f' (the first {MAX_ROWS:,} of {total_records:,}: narrow the dates for the rest)' if total_records > MAX_ROWS else ''))
    xh.header(ws, 4, labels, widths, right=right)

    negatives = 0
    for e in entries:
        r = lv.row_json(e, show_rates)
        line = [e.txn_date, r['event_label'], xh.safe(r['counterparty']), xh.safe(r['detail']), xh.safe(r['product_name']), xh.safe(r['batch_number']),
                e.expiry_date, signed_words(r['qty'], r), r['qty'], ('-' if r['running_qty'] < 0 else '') + packs_words(r['running_qty'], r['pack_size'], r['pack_type'], r['pack_unit']), r['running_qty']]
        if show_rates:
            line.append(r['value_in'] if r['qty'] >= 0 else -(r['value_out'] or 0))
        note = 'History incomplete: no opening balance' if r['balance_negative'] else ''
        negatives += 1 if r['balance_negative'] else 0
        line.append(note)
        ws.append(line)
        row_no = ws.max_row
        if r['balance_negative']:
            ws.cell(row=row_no, column=10).font = xh.RED
            ws.cell(row=row_no, column=11).font = xh.RED
        if r['event'] == 'bookkeeping':
            for c in range(1, ncols + 1):
                ws.cell(row=row_no, column=c).font = xh.MUTED
    last = ws.max_row
    xh.style_cells(ws, 5, last, formats, right=right)
    xh.finish(ws, 4, last, ncols, freeze_cols=2)

    # ── Summary ──
    sm = wb.create_sheet('Summary')
    xh.title_block(sm, f'Summary · {outlet_name}', filters_line, f'Generated {now}')
    xh.header(sm, 4, ['', 'Quantity'], [34, 28], right={2})
    qty = (lambda n: packs_words(n, one_pack['pack_size'], one_pack['pack_type'], one_pack['pack_unit'])) if one_pack else (lambda n: f'{n:,.2f} packs')
    for label, key in [('Received from suppliers and opening stock', 'received'), ('Sold', 'sold'), ('Customer returns', 'customer_returns'), ('Written off or removed', 'written_off'),
                       ('Returned to suppliers', 'supplier_returns'), ('Stock added by adjustment', 'added')]:
        sm.append([label, qty(summary.get(key) or 0)])
    sm.append(['Movements listed', total_records])
    if negatives:
        sm.append([f'Rows with an incomplete history', negatives])
    xh.style_cells(sm, 5, sm.max_row, {}, right={2})
    if not one_pack:
        sm.cell(row=sm.max_row + 2, column=1, value='Across several products there is no single unit, so quantities are shown as packs (a strip, a bottle...).').font = xh.MUTED
    sm.sheet_view.showGridLines = False

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def filters_text(*, start, end, product=None, batch=None, event_label='', search='') -> str:
    parts = [f"Period {_d(start)} to {_d(end)}"]
    parts.append(f'Batch: {batch}' if batch else (f'Product: {product}' if product else 'All products'))
    if event_label:
        parts.append(f'Event: {event_label}')
    if search:
        parts.append(f'Search: "{search}"')
    return ' · '.join(parts)


def _d(raw) -> str:
    try:
        return date.fromisoformat(str(raw)).strftime('%d %b %Y') if raw else 'start'
    except ValueError:
        return str(raw)
