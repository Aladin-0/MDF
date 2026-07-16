import re

def apply_patch():
    with open('apps/billing/views.py', 'r') as f:
        content = f.read()

    # 1. Add the helper function right before SaleCreateView
    helper_func = """def build_sale_response_payload(sale_invoice, message=None, revision_id=None):
    from decimal import Decimal
    sale_items = sale_invoice.items.all()
    response_data = {
        'id': str(sale_invoice.id),
        'outletId': str(sale_invoice.outlet.id),
        'invoiceNo': sale_invoice.invoice_no,
        'invoiceDate': sale_invoice.invoice_date.isoformat() if sale_invoice.invoice_date else None,
        'customerId': str(sale_invoice.customer.id) if sale_invoice.customer else None,
        'customer': {
            'id': str(sale_invoice.customer.id),
            'name': sale_invoice.customer.name,
            'phone': sale_invoice.customer.phone,
            'address': sale_invoice.customer.address,
        } if sale_invoice.customer else None,
        'items': [
            {
                'batchId': str(si.batch_id) if si.batch_id else '',
                'productId': str(si.batch.product_id) if si.batch and si.batch.product_id else '',
                'name': si.product_name,
                'composition': si.composition,
                'manufacturer': si.batch.product.manufacturer if si.batch and si.batch.product else None,
                'packSize': si.pack_size,
                'packUnit': si.pack_unit,
                'batchNo': si.batch_no,
                'expiryDate': si.expiry_date.isoformat() if getattr(si, 'expiry_date', None) else None,
                'scheduleType': si.schedule_type,
                'mrp': float(si.mrp),
                'rate': float(si.rate),
                'qtyStrips': si.qty_strips,
                'qtyLoose': si.qty_loose,
                'totalQty': (si.qty_strips * si.pack_size + si.qty_loose) if si.pack_size else si.qty_strips,
                'saleMode': si.sale_mode,
                'discountPct': float(si.discount_pct),
                'gstRate': float(si.gst_rate),
                'taxableAmount': float(si.taxable_amount),
                'gstAmount': float(si.gst_amount),
                'totalAmount': float(si.total_amount),
            }
            for si in sale_items
        ],
        'subtotal': float(sale_invoice.subtotal),
        'discountAmount': float(sale_invoice.discount_amount),
        'extraDiscountPct': float(sale_invoice.extra_discount_pct),
        'extraDiscountAmount': float(
            (sale_invoice.subtotal - sale_invoice.discount_amount)
            * sale_invoice.extra_discount_pct / Decimal('100')
        ),
        'taxableAmount': float(sale_invoice.taxable_amount),
        'cgstAmount': float(sale_invoice.cgst_amount),
        'sgstAmount': float(sale_invoice.sgst_amount),
        'igstAmount': float(sale_invoice.igst_amount),
        'cgst': float(sale_invoice.cgst),
        'sgst': float(sale_invoice.sgst),
        'igst': float(sale_invoice.igst),
        'roundOff': float(sale_invoice.round_off),
        'grandTotal': float(sale_invoice.grand_total),
        'paymentMode': sale_invoice.payment_mode,
        'cashPaid': float(sale_invoice.cash_paid),
        'upiPaid': float(sale_invoice.upi_paid),
        'cardPaid': float(sale_invoice.card_paid),
        'creditGiven': float(sale_invoice.credit_given),
        'amountPaid': float(sale_invoice.amount_paid),
        'amountDue': float(sale_invoice.amount_due),
        'isReturn': sale_invoice.is_return,
        'billedBy': str(sale_invoice.billed_by.id) if sale_invoice.billed_by else None,
        'billedByName': sale_invoice.billed_by.name if getattr(sale_invoice.billed_by, 'name', None) else None,
        'createdAt': sale_invoice.created_at.isoformat() if sale_invoice.created_at else None,
    }
    if message:
        response_data['message'] = message
    if revision_id:
        response_data['revisionId'] = revision_id
    return response_data


class SaleCreateView"""
    
    content = content.replace('class SaleCreateView', helper_func, 1)

    # 2. Replace the big dictionary building in SaleCreateView with our helper
    pattern_create = re.compile(r"            response_data = \{\n                'id': str\(sale_invoice\.id\).*?'createdAt': sale_invoice\.created_at\.isoformat\(\),\n            \}", re.DOTALL)
    
    replacement_create = "            response_data = build_sale_response_payload(sale_invoice)"
    content = pattern_create.sub(replacement_create, content)

    # 3. Replace SaleDetailView.put return
    target_put = "            return Response({'id': str(invoice.id), 'message': 'Sale invoice updated successfully', 'revisionId': rev_id_str}, status=status.HTTP_200_OK)"
    rep_put = """            response_data = build_sale_response_payload(
                invoice,
                message='Sale invoice updated successfully',
                revision_id=rev_id_str
            )
            return Response(response_data, status=status.HTTP_200_OK)"""
    content = content.replace(target_put, rep_put)

    # 4. Replace SaleReviseView.post return
    target_revise = "            return Response({'id': str(updated_invoice.id), 'message': 'Sale invoice revised successfully', 'revisionId': rev_id_str}, status=status.HTTP_200_OK)"
    rep_revise = """            response_data = build_sale_response_payload(
                updated_invoice,
                message='Sale invoice revised successfully',
                revision_id=rev_id_str
            )
            return Response(response_data, status=status.HTTP_200_OK)"""
    content = content.replace(target_revise, rep_revise)
    
    with open('apps/billing/views.py', 'w') as f:
        f.write(content)

apply_patch()
