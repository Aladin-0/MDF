"""
Where did a batch come from, and who got it? The answer a drug inspector, a supplier recall or a customer complaint needs:
the purchases that brought it in, every sale out of it (invoice, customer, the person it was for, quantity), and what is left.

Cancelled invoices and returns-as-invoices are not sales. Quantities are packs (strips + loose / the line's pack size).
"""
from datetime import date
from decimal import Decimal
from io import BytesIO

from apps.billing.models import SaleItem
from apps.inventory import ledger_view as lv
from apps.purchases.models import PurchaseItem

MAX_SALES = 2000


def _packs(strips, loose, pack_size) -> float:
    return float((Decimal(strips or 0) + Decimal(loose or 0) / Decimal(pack_size or 1)).quantize(Decimal('0.001')))


def trace(batch, show_rates: bool) -> dict:
    purchases = []
    for pi in (PurchaseItem.objects.filter(batch=batch, invoice__status='POSTED').select_related('invoice', 'invoice__distributor').order_by('invoice__invoice_date', 'created_at')):
        row = {'invoice_id': str(pi.invoice_id), 'invoice_no': pi.invoice.invoice_no, 'date': pi.invoice.invoice_date.isoformat(),
               'distributor': pi.invoice.distributor.name if pi.invoice.distributor else '', 'qty_packs': float(pi.qty + pi.free_qty)}
        if show_rates:
            row['purchase_rate'] = float(pi.purchase_rate)
        purchases.append(row)

    items = (SaleItem.objects.filter(batch=batch, invoice__is_cancelled=False, invoice__is_return=False)
             .select_related('invoice', 'invoice__customer', 'invoice__patient').order_by('-invoice__invoice_date'))
    total = items.count()
    sales, sold = [], Decimal('0')
    for it in items[:MAX_SALES]:
        inv = it.invoice
        qty = _packs(it.qty_strips, it.qty_loose, it.pack_size)
        back = _packs(it.qty_returned_strips, it.qty_returned_loose, it.pack_size)
        who = inv.customer
        sales.append({
            'invoice_id': str(inv.id), 'invoice_no': inv.invoice_no, 'date': inv.invoice_date.date().isoformat(),
            'customer': who.name if who else (inv.walk_in_name or 'Walk-in'), 'customer_phone': who.phone if who else '',
            'patient': inv.patient.name if inv.patient_id and inv.patient else '',
            'qty_packs': qty, 'returned_packs': back, 'pack_size': it.pack_size,
        })
        sold += Decimal(str(qty)) - Decimal(str(back))
    card = lv.batch_card(batch, show_rates)
    return {
        'batch': card, 'purchases': purchases, 'sales': sales, 'salesTruncated': total > MAX_SALES, 'salesCount': total,
        'totals': {'purchased_packs': round(sum(p['qty_packs'] for p in purchases), 3), 'sold_packs': float(sold.quantize(Decimal('0.001'))), 'left_packs': card['qty_packs']},
    }


def build_workbook(t: dict, outlet_name: str) -> bytes:
    import openpyxl
    from openpyxl.styles import Alignment, Font
    from apps.inventory import xlsx_helpers as xh

    b = t['batch']
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Batch'
    for k, v in [('Outlet', outlet_name), ('Product', b['product_name']), ('Manufacturer', b['manufacturer']), ('Batch', b['batch_number']), ('Expiry', date.fromisoformat(b['expiry_date'])),
                 ('In stock now (packs)', b['qty_packs']), ('Supplier', (b.get('supplier') or {}).get('distributor_name', 'No purchase record')),
                 ('Purchased (packs)', t['totals']['purchased_packs']), ('Sold, net of returns (packs)', t['totals']['sold_packs'])]:
        ws.append([k, xh.safe(v)])
        ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
        if isinstance(v, date):
            ws.cell(row=ws.max_row, column=2).number_format = xh.DATE
        ws.cell(row=ws.max_row, column=2).alignment = Alignment(horizontal='left')
    ws.column_dimensions['A'].width = 30
    ws.column_dimensions['B'].width = 42
    ws.sheet_view.showGridLines = False

    s = wb.create_sheet('Who received it')
    xh.header(s, 1, ['Date', 'Invoice', 'Customer', 'Phone', 'For (patient)', 'Qty (packs)', 'Returned (packs)'], [13, 20, 28, 16, 26, 12, 16], right={6, 7})
    for r in t['sales']:
        s.append([date.fromisoformat(r['date']), xh.safe(r['invoice_no']), xh.safe(r['customer']), xh.safe(r['customer_phone']), xh.safe(r['patient']), r['qty_packs'], r['returned_packs']])
    xh.style_cells(s, 2, s.max_row, {1: xh.DATE, 6: xh.PACKS, 7: xh.PACKS}, right={6, 7})
    xh.finish(s, 1, s.max_row, 7)

    p = wb.create_sheet('Purchases')
    xh.header(p, 1, ['Date', 'Invoice', 'Supplier', 'Qty (packs)'], [13, 20, 30, 12], right={4})
    for r in t['purchases']:
        p.append([date.fromisoformat(r['date']), xh.safe(r['invoice_no']), xh.safe(r['distributor']), r['qty_packs']])
    xh.style_cells(p, 2, p.max_row, {1: xh.DATE, 4: xh.PACKS}, right={4})
    xh.finish(p, 1, p.max_row, 4, landscape=False)
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
