import re
with open('apps/backend/apps/billing/quotation_views.py', 'r') as f:
    content = f.read()

target1 = """            "outletId": str(quotation.outlet_id),
            "customerId": str(quotation.customer_id) if quotation.customer_id else None,
            "doctorName": quotation.doctor_name,
            "hospitalName": quotation.hospital_name,
            "subtotal": quotation.subtotal,"""

replace1 = """            "outletId": str(quotation.outlet_id),
            "customerId": str(quotation.customer_id) if quotation.customer_id else None,
            "doctorId": request.data.get("doctorId"),
            "doctorName": request.data.get("doctorName") or quotation.doctor_name,
            "hospitalName": request.data.get("hospitalName") or quotation.hospital_name,
            "prescriptionNo": request.data.get("prescriptionNo"),
            "scheduleHData": request.data.get("scheduleHData"),
            "subtotal": quotation.subtotal,"""

target2 = """        for item in quotation.items.all():
            payload["items"].append({
                "batchId": str(item.batch_id) if item.batch_id else None,
                "productId": str(item.batch.product_id) if item.batch_id and hasattr(item, 'batch') and getattr(item, 'batch') else None,
                "qtyStrips": item.qty_strips,
                "qtyLoose": item.qty_loose,
                "rate": item.rate,
                "discountPct": item.discount_pct,
                "gstRate": item.gst_rate,
                "taxableAmount": item.taxable_amount,
                "gstAmount": item.gst_amount,
                "totalAmount": item.total_amount
            })"""

replace2 = """        for item in quotation.items.all():
            product_id = None
            schedule_type = "OTC"
            if item.batch_id and hasattr(item, 'batch') and getattr(item, 'batch'):
                product_id = str(item.batch.product_id)
                if hasattr(item.batch, 'product') and getattr(item.batch, 'product'):
                    schedule_type = item.batch.product.schedule_type or "OTC"

            payload["items"].append({
                "batchId": str(item.batch_id) if item.batch_id else None,
                "productId": product_id,
                "scheduleType": schedule_type,
                "qtyStrips": item.qty_strips,
                "qtyLoose": item.qty_loose,
                "rate": item.rate,
                "discountPct": item.discount_pct,
                "gstRate": item.gst_rate,
                "taxableAmount": item.taxable_amount,
                "gstAmount": item.gst_amount,
                "totalAmount": item.total_amount
            })"""

content = content.replace(target1, replace1)
content = content.replace(target2, replace2)

with open('apps/backend/apps/billing/quotation_views.py', 'w') as f:
    f.write(content)
