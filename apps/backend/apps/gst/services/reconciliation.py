import logging
import re
import os
from apps.reports.models import ITCReconciliationRun, GSTR2BImportJob, GSTR2BData, ITCReconciliationResult, GSTTransactionSnapshot
from apps.purchases.models import PurchaseInvoice
from apps.core.models import OutletSettings
from django.db.models import Sum

logger = logging.getLogger(__name__)

def normalize_invoice_number(inv_str: str) -> str:
    """Strip non-alphanumeric chars and leading zeros for fuzzy matching."""
    if not inv_str: return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(inv_str).lower()).lstrip('0')

def run_advisory_reconciliation(period: str, outlet_id: str, gstin: str):
    """
    Advisory-only reconciliation for GSTR-2B.
    Does NOT modify purchase invoices, ledgers, or return drafts.
    """
    job = GSTR2BImportJob.objects.filter(
        outlet_id=outlet_id, gstin=gstin, period=period, status__in=['COMPLETED', 'NO_CHANGE']
    ).order_by('-retrieval_timestamp').first()

    if not job:
        raise ValueError("No completed GSTR-2B import job found for this period.")

    run = ITCReconciliationRun.objects.create(
        outlet_id=outlet_id,
        import_job=job,
        period=period,
        status='IN_PROGRESS'
    )

    try:
        try:
            settings = OutletSettings.objects.get(outlet_id=outlet_id)
            tolerance = float(settings.gstr2b_tolerance)
        except OutletSettings.DoesNotExist:
            tolerance = float(os.environ.get('GSTR2B_TOLERANCE', '1.0'))

        # Load GSTR-2B data efficiently
        gstr2b_records = GSTR2BData.objects.filter(import_job=job)
        total_2b = gstr2b_records.count()
        
        # Load Purchase Invoices (mocking a period filter by invoice date for now)
        year = int(period[2:])
        month = int(period[:2])
        
        # Optimize memory: fetch only needed fields and map by normalized invoice number
        purchases_qs = PurchaseInvoice.objects.filter(
            outlet_id=outlet_id,
            invoice_date__year=year,
            invoice_date__month=month
        ).select_related('distributor').only('id', 'invoice_no', 'grand_total', 'distributor__gstin')

        total_pr = purchases_qs.count()
        
        # Also prefetch snapshots to link ITCReconciliationResult
        snapshots = GSTTransactionSnapshot.objects.filter(
            outlet_id=outlet_id, 
            period=period,
            transaction_type__in=['purchase', 'purchase_return', 'purchase_credit_note', 'purchase_debit_note']
        ).only('id', 'document_id', 'snapshot_json')
        snapshot_by_doc = {str(s.document_id): s for s in snapshots}

        pr_by_composite_key = {}
        # Use iterator to save memory if count is large
        for p in purchases_qs.iterator(chunk_size=2000):
            norm_inv = normalize_invoice_number(p.invoice_no)
            gstin = (p.distributor.gstin if p.distributor else "").lower().strip()
            composite_key = f"{gstin}_{norm_inv}_{period}"
            pr_by_composite_key[composite_key] = p

        summary = {
            "total_gstr2b_records": total_2b,
            "total_purchase_records": total_pr,
            "matched": 0,
            "matched_with_tolerance": 0,
            "mismatch_value": 0,
            "tax_split_mismatch": 0,
            "missing_in_2b": 0,
            "missing_in_pr": 0,
            "results": []
        }

        results_to_create = []

        for gstr in gstr2b_records.iterator(chunk_size=2000):
            norm_gstr_inv = normalize_invoice_number(gstr.invoice_number)
            gstr_supplier = str(gstr.supplier_gstin or "").lower().strip()
            composite_key = f"{gstr_supplier}_{norm_gstr_inv}_{period}"
            
            pr = pr_by_composite_key.get(composite_key)
            
            if not pr:
                summary['missing_in_pr'] += 1
                match_status = "MISSING_IN_PR"
                summary['results'].append({
                    "invoice_number": gstr.invoice_number,
                    "supplier": gstr.supplier_gstin,
                    "status": match_status
                })
                snapshot = None
            else:
                snapshot = snapshot_by_doc.get(str(pr.id))
                gstr_invoice_value = float(gstr.taxable_value) + float(gstr.igst) + float(gstr.cgst) + float(gstr.sgst) + float(gstr.cess)
                diff = abs(gstr_invoice_value - float(pr.grand_total))
                if diff <= tolerance:
                    pr_cgst, pr_sgst, pr_igst = 0.0, 0.0, 0.0
                    if snapshot and snapshot.snapshot_json:
                        pr_cgst = float(snapshot.snapshot_json.get('cgst', 0))
                        pr_sgst = float(snapshot.snapshot_json.get('sgst', 0))
                        pr_igst = float(snapshot.snapshot_json.get('igst', 0))

                    gstr_cgst = float(gstr.cgst or 0)
                    gstr_sgst = float(gstr.sgst or 0)
                    gstr_igst = float(gstr.igst or 0)

                    if (abs(pr_cgst - gstr_cgst) <= tolerance and
                        abs(pr_sgst - gstr_sgst) <= tolerance and
                        abs(pr_igst - gstr_igst) <= tolerance):
                        match_status = "MATCHED"
                        summary["matched"] += 1
                    else:
                        match_status = "TAX_SPLIT_MISMATCH"
                        summary["tax_split_mismatch"] += 1
                else:
                    match_status = "MISMATCHED"
                    summary['mismatch_value'] += 1
                    
                summary['results'].append({
                    "invoice_number": gstr.invoice_number,
                    "internal_invoice_number": pr.invoice_no,
                    "supplier": gstr.supplier_gstin,
                    "status": match_status,
                    "diff": diff
                })
                del pr_by_composite_key[composite_key]

            results_to_create.append(ITCReconciliationResult(
                run=run,
                purchase_snapshot=snapshot,
                gstr2b_record=gstr,
                match_status=match_status
            ))

        # Remaining purchases are missing in 2B
        for composite_key, pr in pr_by_composite_key.items():
            summary['missing_in_2b'] += 1
            summary['results'].append({
                "invoice_number": pr.invoice_no,
                "status": "MISSING_IN_2B"
            })
            snapshot = snapshot_by_doc.get(str(pr.id))
            if snapshot:
                results_to_create.append(ITCReconciliationResult(
                    run=run,
                    purchase_snapshot=snapshot,
                    gstr2b_record=None,
                    match_status="MISSING_IN_2B"
                ))

        if results_to_create:
            ITCReconciliationResult.objects.bulk_create(results_to_create, batch_size=2000)

        run.summary = summary
        run.status = 'COMPLETED'
        run.save()
        return run

    except Exception as e:
        logger.exception("Reconciliation failed")
        run.status = 'FAILED'
        run.summary = {"error": str(e)}
        run.save()
        raise
