import logging
from collections import defaultdict
from decimal import Decimal
from typing import Dict, Any
from django.utils.timezone import localtime, is_aware
from apps.reports.models import GSTTransactionSnapshot

logger = logging.getLogger(__name__)

def _get_local_date(dt):
    if not dt:
        return None
    if hasattr(dt, 'date'):
        if is_aware(dt):
            return localtime(dt).date()
        return dt.date()
    return dt

def _get_state_code(gstin: str, state: str, default: str) -> str:
    """Extracts 2-digit state code from GSTIN or falls back to state map/default."""
    if gstin and len(gstin) >= 2:
        return gstin[:2]
    if state and len(state) == 2 and state.isdigit():
        return state
    # Simple fallback; real app would map state string to code.
    return state if state else default

def _determine_interstate(outlet_state_code: str, party_state_code: str) -> bool:
    if not party_state_code:
        return False
    return outlet_state_code != party_state_code

def create_sale_snapshots(sale_invoice) -> GSTTransactionSnapshot:
    """Creates a GST snapshot for a finalized SaleInvoice."""
    # Delete existing snapshot if re-finalizing (though ideally invoices are immutable)
    GSTTransactionSnapshot.objects.filter(
        outlet=sale_invoice.outlet,
        transaction_type='sale',
        document_id=sale_invoice.id
    ).delete()

    outlet = sale_invoice.outlet
    period = sale_invoice.invoice_date.strftime('%m%Y')
    
    customer = sale_invoice.customer
    customer_name = customer.name if customer else "Cash/Walk-in"
    customer_gstin = customer.gstin if customer and customer.gstin else ""
    is_b2b = bool(customer_gstin)
    
    outlet_state_code = outlet.state_code or (outlet.gstin[:2] if outlet.gstin else "27")
    cust_state_code = _get_state_code(customer_gstin, customer.state if customer else "", outlet_state_code)
    is_interstate = _determine_interstate(outlet_state_code, cust_state_code)
    pos = cust_state_code

    items_by_rate = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
    })
    
    hsn_summary = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
        'qty': Decimal('0'),
        'uqc': 'PAC' # Using Pack as default UQC for pharma
    })

    for item in sale_invoice.items.all():
        rate_str = str(item.gst_rate)
        taxable = item.taxable_amount
        gst_amt = item.gst_amount
        
        igst = gst_amt if is_interstate else Decimal('0')
        cgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        sgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        
        items_by_rate[rate_str]['taxable_amount'] += taxable
        items_by_rate[rate_str]['igst'] += igst
        items_by_rate[rate_str]['cgst'] += cgst
        items_by_rate[rate_str]['sgst'] += sgst
        
        hsn = item.hsn_code or 'UNKNOWN'
        hsn_summary[hsn]['taxable_amount'] += taxable
        hsn_summary[hsn]['igst'] += igst
        hsn_summary[hsn]['cgst'] += cgst
        hsn_summary[hsn]['sgst'] += sgst
        hsn_summary[hsn]['qty'] += Decimal(item.qty_strips)

    # Convert Decimals to float for JSON
    def _jsonify_dict(d: dict) -> dict:
        return {k: {sk: float(sv) if isinstance(sv, Decimal) else sv for sk, sv in v.items()} for k, v in d.items()}

    from apps.gst.conf import B2CL_THRESHOLD
    orig_total = sale_invoice.grand_total
    supply_class = "B2B" if is_b2b else ("B2CL" if is_interstate and orig_total > Decimal(str(B2CL_THRESHOLD)) else "B2CS")

    snapshot_json = {
        'customer_name': customer_name,
        'customer_gstin': customer_gstin,
        'is_b2b': is_b2b,
        'is_interstate': is_interstate,
        'pos': pos,
        'supplier_state_code': outlet_state_code,
        'original_supply_classification': supply_class,
        'items_by_rate': _jsonify_dict(items_by_rate),
        'hsn_summary': _jsonify_dict(hsn_summary),
    }

    return GSTTransactionSnapshot.objects.create(
        outlet=outlet,
        gstin=outlet.gstin,
        period=period,
        transaction_type='sale',
        document_id=sale_invoice.id,
        document_number=sale_invoice.invoice_no,
        document_date=_get_local_date(sale_invoice.invoice_date),
        snapshot_json=snapshot_json
    )

def create_sales_return_snapshots(sales_return) -> GSTTransactionSnapshot:
    """Creates a GST snapshot for a finalized SalesReturn."""
    GSTTransactionSnapshot.objects.filter(
        outlet=sales_return.outlet,
        transaction_type='sales_return',
        document_id=sales_return.id
    ).delete()

    outlet = sales_return.outlet
    period = sales_return.return_date.strftime('%m%Y')
    
    orig_invoice = sales_return.original_sale
    customer = orig_invoice.customer if orig_invoice else None
    customer_name = customer.name if customer else "Cash/Walk-in"
    customer_gstin = customer.gstin if customer and customer.gstin else ""
    is_b2b = bool(customer_gstin)
    
    outlet_state_code = outlet.state_code or (outlet.gstin[:2] if outlet.gstin else "27")
    cust_state_code = _get_state_code(customer_gstin, customer.state if customer else "", outlet_state_code)
    is_interstate = _determine_interstate(outlet_state_code, cust_state_code)
    pos = cust_state_code
    
    orig_invoice_id = str(orig_invoice.id) if orig_invoice else ""
    orig_invoice_no = orig_invoice.invoice_no if orig_invoice else ""
    orig_invoice_date = orig_invoice.invoice_date.isoformat() if orig_invoice else None
    manual_override = getattr(sales_return, 'manual_override', False)
    orig_total = orig_invoice.grand_total if orig_invoice else sales_return.total_amount
    
    from apps.gst.conf import B2CL_THRESHOLD
    orig_supply_class = "B2B" if is_b2b else ("B2CL" if is_interstate and orig_total > Decimal(str(B2CL_THRESHOLD)) else "B2CS")

    items_by_rate = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
    })
    
    hsn_summary = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
        'qty': Decimal('0'),
        'uqc': 'PAC'
    })

    for ret_item in sales_return.items.all():
        orig_item = getattr(ret_item, 'original_sale_item', None)
        # If manual override and no orig_item, we need fallback. But we assume return_rate is populated.
        # Fallback gst_rate to 0 if not provided, or fetch from product/batch if possible. 
        # Here we'll try to find a GST rate.
        if orig_item:
            gst_rate = orig_item.gst_rate
            hsn = orig_item.hsn_code or 'UNKNOWN'
        else:
            gst_rate = Decimal('0') # For manual override without orig_item, might need to rely on batch or pass 0.
            if hasattr(ret_item, 'batch') and ret_item.batch and hasattr(ret_item.batch, 'product'):
                gst_rate = ret_item.batch.product.gst_rate or Decimal('0')
                hsn = ret_item.batch.product.hsn_code or 'UNKNOWN'
            else:
                hsn = 'UNKNOWN'

        rate_str = str(gst_rate)

        # Calculate proportional taxable and GST amounts based on returned quantity
        taxable = (Decimal(ret_item.qty_returned) * ret_item.return_rate).quantize(Decimal('0.01'))
        gst_amt = (taxable * gst_rate / Decimal('100')).quantize(Decimal('0.01'))

        igst = gst_amt if is_interstate else Decimal('0')
        cgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        sgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')

        items_by_rate[rate_str]['taxable_amount'] += taxable
        items_by_rate[rate_str]['igst'] += igst
        items_by_rate[rate_str]['cgst'] += cgst
        items_by_rate[rate_str]['sgst'] += sgst

        hsn_summary[hsn]['taxable_amount'] += taxable
        hsn_summary[hsn]['igst'] += igst
        hsn_summary[hsn]['cgst'] += cgst
        hsn_summary[hsn]['sgst'] += sgst
        hsn_summary[hsn]['qty'] += Decimal(ret_item.qty_returned)

    def _jsonify_dict(d: dict) -> dict:
        return {k: {sk: float(sv) if isinstance(sv, Decimal) else sv for sk, sv in v.items()} for k, v in d.items()}

    snapshot_json = {
        'customer_name': customer_name,
        'customer_gstin': customer_gstin,
        'is_b2b': is_b2b,
        'is_interstate': is_interstate,
        'pos': pos,
        'supplier_state_code': outlet_state_code,
        'original_invoice_id': orig_invoice_id,
        'original_invoice_no': orig_invoice_no,
        'original_invoice_date': orig_invoice_date,
        'note_number': sales_return.return_no,
        'note_date': sales_return.return_date.isoformat(),
        'reason': sales_return.reason,
        'original_supply_classification': orig_supply_class,
        'verified_link': not manual_override,
        'manual_override': manual_override,
        'items_by_rate': _jsonify_dict(items_by_rate),
        'hsn_summary': _jsonify_dict(hsn_summary),
    }

    return GSTTransactionSnapshot.objects.create(
        outlet=outlet,
        gstin=outlet.gstin,
        period=period,
        transaction_type='sales_return',
        document_id=sales_return.id,
        document_number=sales_return.return_no,
        document_date=_get_local_date(sales_return.return_date),
        snapshot_json=snapshot_json
    )

def create_purchase_snapshots(purchase_invoice) -> GSTTransactionSnapshot:
    """Creates a GST snapshot for a finalized PurchaseInvoice."""
    GSTTransactionSnapshot.objects.filter(
        outlet=purchase_invoice.outlet,
        transaction_type='purchase',
        document_id=purchase_invoice.id
    ).delete()

    outlet = purchase_invoice.outlet
    period = purchase_invoice.invoice_date.strftime('%m%Y')
    
    distributor = purchase_invoice.distributor
    distributor_name = distributor.name
    distributor_gstin = distributor.gstin or ""
    is_b2b = bool(distributor_gstin)
    
    outlet_state_code = outlet.state_code or (outlet.gstin[:2] if outlet.gstin else "27")
    dist_state_code = _get_state_code(distributor_gstin, distributor.state, outlet_state_code)
    is_interstate = _determine_interstate(outlet_state_code, dist_state_code)
    pos = dist_state_code

    is_import = getattr(purchase_invoice, 'is_import', False)
    is_rcm = getattr(purchase_invoice, 'is_rcm', False)
    is_exempt = getattr(purchase_invoice, 'is_exempt', False)

    items_by_rate = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
    })
    
    hsn_summary = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
        'qty': Decimal('0'),
        'uqc': 'PAC'
    })

    for item in purchase_invoice.items.all():
        rate_str = str(item.gst_rate)
        taxable = item.taxable_amount
        gst_amt = item.gst_amount
        cess_amt = item.cess_amount if hasattr(item, 'cess_amount') else Decimal('0')
        
        igst = gst_amt if is_interstate else Decimal('0')
        cgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        sgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        
        items_by_rate[rate_str]['taxable_amount'] += taxable
        items_by_rate[rate_str]['igst'] += igst
        items_by_rate[rate_str]['cgst'] += cgst
        items_by_rate[rate_str]['sgst'] += sgst
        items_by_rate[rate_str]['cess'] += cess_amt
        
        hsn = item.hsn_code or 'UNKNOWN'
        hsn_summary[hsn]['taxable_amount'] += taxable
        hsn_summary[hsn]['igst'] += igst
        hsn_summary[hsn]['cgst'] += cgst
        hsn_summary[hsn]['sgst'] += sgst
        hsn_summary[hsn]['cess'] += cess_amt
        hsn_summary[hsn]['qty'] += Decimal(item.qty)

    def _jsonify_dict(d: dict) -> dict:
        return {k: {sk: float(sv) if isinstance(sv, Decimal) else sv for sk, sv in v.items()} for k, v in d.items()}

    snapshot_json = {
        'distributor_name': distributor_name,
        'distributor_gstin': distributor_gstin,
        'is_b2b': is_b2b,
        'is_interstate': is_interstate,
        'pos': pos,
        'supplier_state_code': outlet_state_code,
        'is_import': is_import,
        'is_rcm': is_rcm,
        'is_exempt': is_exempt,
        'items_by_rate': _jsonify_dict(items_by_rate),
        'hsn_summary': _jsonify_dict(hsn_summary),
    }

    return GSTTransactionSnapshot.objects.create(
        outlet=outlet,
        gstin=outlet.gstin,
        period=period,
        transaction_type='purchase',
        document_id=purchase_invoice.id,
        document_number=purchase_invoice.invoice_no,
        document_date=_get_local_date(purchase_invoice.invoice_date),
        snapshot_json=snapshot_json
    )

def create_purchase_return_snapshots(debit_note) -> GSTTransactionSnapshot:
    """Creates a GST snapshot for a finalized DebitNote (Purchase Return)."""
    GSTTransactionSnapshot.objects.filter(
        outlet=debit_note.outlet,
        transaction_type='purchase_return',
        document_id=debit_note.id
    ).delete()

    outlet = debit_note.outlet
    period = debit_note.date.strftime('%m%Y')
    
    distributor = debit_note.distributor
    distributor_name = distributor.name
    distributor_gstin = distributor.gstin or ""
    is_b2b = bool(distributor_gstin)
    
    outlet_state_code = outlet.state_code or (outlet.gstin[:2] if outlet.gstin else "27")
    dist_state_code = _get_state_code(distributor_gstin, distributor.state, outlet_state_code)
    is_interstate = _determine_interstate(outlet_state_code, dist_state_code)
    pos = dist_state_code

    purchase_invoice = debit_note.purchase_invoice
    is_import = getattr(purchase_invoice, 'is_import', False) if purchase_invoice else False
    is_rcm = getattr(purchase_invoice, 'is_rcm', False) if purchase_invoice else False
    is_exempt = getattr(purchase_invoice, 'is_exempt', False) if purchase_invoice else False

    items_by_rate = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
    })
    
    hsn_summary = defaultdict(lambda: {
        'taxable_amount': Decimal('0'),
        'igst': Decimal('0'),
        'cgst': Decimal('0'),
        'sgst': Decimal('0'),
        'cess': Decimal('0'),
        'qty': Decimal('0'),
        'uqc': 'PAC'
    })

    for item in debit_note.items.all():
        rate_str = str(item.gst_rate)
        
        # Calculate taxable amount since DebitNoteItem only stores qty, rate, total
        taxable = (Decimal(item.qty) * Decimal(item.rate)).quantize(Decimal('0.01'))
        gst_amt = (taxable * Decimal(item.gst_rate) / Decimal('100')).quantize(Decimal('0.01'))
        cess_amt = Decimal('0') # Assume no cess for returns for now unless specifically added
        
        igst = gst_amt if is_interstate else Decimal('0')
        cgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        sgst = (gst_amt / Decimal('2')) if not is_interstate else Decimal('0')
        
        items_by_rate[rate_str]['taxable_amount'] += taxable
        items_by_rate[rate_str]['igst'] += igst
        items_by_rate[rate_str]['cgst'] += cgst
        items_by_rate[rate_str]['sgst'] += sgst
        items_by_rate[rate_str]['cess'] += cess_amt
        
        hsn = item.batch.product.hsn_code if hasattr(item, 'batch') and item.batch and hasattr(item.batch, 'product') and item.batch.product.hsn_code else 'UNKNOWN'
        
        hsn_summary[hsn]['taxable_amount'] += taxable
        hsn_summary[hsn]['igst'] += igst
        hsn_summary[hsn]['cgst'] += cgst
        hsn_summary[hsn]['sgst'] += sgst
        hsn_summary[hsn]['cess'] += cess_amt
        hsn_summary[hsn]['qty'] += Decimal(item.qty)

    def _jsonify_dict(d: dict) -> dict:
        return {k: {sk: float(sv) if isinstance(sv, Decimal) else sv for sk, sv in v.items()} for k, v in d.items()}

    snapshot_json = {
        'distributor_name': distributor_name,
        'distributor_gstin': distributor_gstin,
        'is_b2b': is_b2b,
        'is_interstate': is_interstate,
        'pos': pos,
        'supplier_state_code': outlet_state_code,
        'is_import': is_import,
        'is_rcm': is_rcm,
        'is_exempt': is_exempt,
        'items_by_rate': _jsonify_dict(items_by_rate),
        'hsn_summary': _jsonify_dict(hsn_summary),
    }

    return GSTTransactionSnapshot.objects.create(
        outlet=outlet,
        gstin=outlet.gstin,
        period=period,
        transaction_type='purchase_return',
        document_id=debit_note.id,
        document_number=debit_note.debit_note_no,
        document_date=_get_local_date(debit_note.date),
        snapshot_json=snapshot_json
    )
