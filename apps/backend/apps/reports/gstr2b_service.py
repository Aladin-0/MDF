import logging
import requests
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List
from django.conf import settings
from django.db import transaction
from apps.core.models import Outlet
from apps.reports.models import GSTTransactionSnapshot, GSTR2BData, ITCReconciliationRun, ITCReconciliationResult, DeferredITCEntry
from apps.gst.services.taxpayer_auth import get_taxpayer_session_token, TaxpayerAuthError
from apps.gst.services.sandbox_auth import get_sandbox_credentials
from apps.gst.conf import GSTR3BValidationConfig

logger = logging.getLogger(__name__)

def strip_invoice_number(inv_num: str) -> str:
    if not inv_num:
        return ""
    cleaned = re.sub(r'[^a-zA-Z0-9]', '', inv_num).upper()
    return cleaned.lstrip('0')

class GSTR2BService:
    def __init__(self, outlet: Outlet, period: str):
        self.outlet = outlet
        self.period = period
        self.creds = get_sandbox_credentials()

    def fetch_gstr2b_data(self) -> Dict[str, Any]:
        try:
            session_token = get_taxpayer_session_token(self.outlet.id)
        except Exception as e:
            logger.error(f"Failed to get taxpayer session: {e}")
            raise TaxpayerAuthError(401, str(e))

        from apps.gst.provider import get_active_provider
        provider = get_active_provider()
        return provider.fetch_gstr2b(self.outlet.gstin, self.period, session_token)

    @transaction.atomic
    def reconcile(self) -> Dict[str, Any]:
        run = ITCReconciliationRun.objects.create(
            outlet=self.outlet,
            period=self.period,
            status='Pending'
        )
        
        try:
            gstr2b_data = self.fetch_gstr2b_data()
        except TaxpayerAuthError as e:
            logger.warning(f"Failed to fetch GSTR-2B from Sandbox. Reason: {e}")
            gstr2b_data = {}

        # Parse and save GSTR-2B Data
        b2b_list = gstr2b_data.get('b2b', []) if isinstance(gstr2b_data, dict) else []
        GSTR2BData.objects.filter(outlet=self.outlet, period=self.period).delete()
        g2b_records = []
        for supplier in b2b_list:
            ctin = supplier.get('ctin')
            status = supplier.get('supf', 'Active') # Example field
            for inv in supplier.get('inv', []):
                inv_num = inv.get('inum')
                inv_dt_str = inv.get('dt') # format: dd-mm-yyyy
                try:
                    inv_dt = datetime.strptime(inv_dt_str, '%d-%m-%Y').date()
                except:
                    inv_dt = datetime.now().date()

                txval = 0.0
                camt = 0.0
                samt = 0.0
                iamt = 0.0
                csamt = 0.0

                for item in inv.get('itms', []):
                    det = item.get('itm_det', {})
                    txval += det.get('txval', 0.0)
                    camt += det.get('camt', 0.0)
                    samt += det.get('samt', 0.0)
                    iamt += det.get('iamt', 0.0)
                    csamt += det.get('csamt', 0.0)

                g2b_records.append(GSTR2BData(
                    outlet=self.outlet,
                    period=self.period,
                    supplier_gstin=ctin,
                    invoice_number=inv_num,
                    invoice_date=inv_dt,
                    taxable_value=Decimal(str(txval)),
                    igst=Decimal(str(iamt)),
                    cgst=Decimal(str(camt)),
                    sgst=Decimal(str(samt)),
                    cess=Decimal(str(csamt)),
                    supplier_status=status,
                    raw_data=inv
                ))
        GSTR2BData.objects.bulk_create(g2b_records)

        # Proceed with reconciliation
        gstr2b_records = list(GSTR2BData.objects.filter(outlet=self.outlet, period=self.period))
        purchases = list(GSTTransactionSnapshot.objects.filter(
            outlet=self.outlet, 
            period=self.period, 
            transaction_type='purchase'
        ))

        b2b_dict = {f"{r.supplier_gstin}_{r.invoice_number}".upper(): r for r in gstr2b_records}
        pr_dict = {f"{p.snapshot_json.get('distributor_gstin', '')}_{p.document_number}".upper(): p for p in purchases}

        results = []
        summary = {
            "matched": 0,
            "mismatched": 0,
            "missing_in_2b": 0,
            "missing_in_pr": 0,
            "total_itc_matched": 0.0,
        }

        unmatched_pr = []
        unmatched_2b = []

        all_keys = set(b2b_dict.keys()).union(set(pr_dict.keys()))
        for key in all_keys:
            r2b = b2b_dict.get(key)
            pr = pr_dict.get(key)

            if r2b and pr:
                self._evaluate_match(run, pr, r2b, results, summary, exact=True)
            elif pr and not r2b:
                unmatched_pr.append(pr)
            elif r2b and not pr:
                unmatched_2b.append(r2b)

        fuzzy_b2b_dict = {f"{r.supplier_gstin}_{strip_invoice_number(r.invoice_number)}".upper(): r for r in unmatched_2b}
        still_unmatched_pr = []
        
        for pr in unmatched_pr:
            fuzzy_key = f"{pr.snapshot_json.get('distributor_gstin', '')}_{strip_invoice_number(pr.document_number)}".upper()
            r2b = fuzzy_b2b_dict.pop(fuzzy_key, None)
            if r2b:
                self._evaluate_match(run, pr, r2b, results, summary, exact=False)
            else:
                still_unmatched_pr.append(pr)

        still_unmatched_2b = list(fuzzy_b2b_dict.values())

        for pr in still_unmatched_pr:
            results.append(ITCReconciliationResult(
                run=run,
                purchase_snapshot=pr,
                match_status='MISSING_IN_2B',
                mismatch_reasons=["Invoice not found in GSTR-2B"]
            ))
            summary["missing_in_2b"] += 1
            
            # Create or update DeferredITCEntry
            pr_igst = Decimal('0')
            pr_cgst = Decimal('0')
            pr_sgst = Decimal('0')
            pr_cess = Decimal('0')
            for rate, vals in pr.snapshot_json.get('items_by_rate', {}).items():
                pr_igst += Decimal(str(vals.get('igst', 0)))
                pr_cgst += Decimal(str(vals.get('cgst', 0)))
                pr_sgst += Decimal(str(vals.get('sgst', 0)))
                pr_cess += Decimal(str(vals.get('cess', 0)))
                
            deferred, created = DeferredITCEntry.objects.get_or_create(
                purchase_invoice_id=pr.document_id,
                original_period=pr.period,
                defaults={
                    'iamt': pr_igst,
                    'camt': pr_cgst,
                    'samt': pr_sgst,
                    'csamt': pr_cess,
                    'status': 'DEFERRED'
                }
            )
            if not created:
                deferred.status = 'DEFERRED'
                deferred.iamt = pr_igst
                deferred.camt = pr_cgst
                deferred.samt = pr_sgst
                deferred.csamt = pr_cess
                deferred.save()

        for r2b in still_unmatched_2b:
            results.append(ITCReconciliationResult(
                run=run,
                gstr2b_record=r2b,
                match_status='MISSING_IN_PR',
                mismatch_reasons=["Invoice not found in Purchase Register"]
            ))
            summary["missing_in_pr"] += 1

        ITCReconciliationResult.objects.bulk_create(results)

        run.status = 'Completed'
        run.summary = summary
        run.save()

        return {
            'run_id': str(run.id),
            'summary': summary
        }

    def _evaluate_match(self, run, pr, r2b, results, summary, exact=True):
        mismatches = []
        annotations = []  # Non-blocking notes (e.g. format differences)

        json_data = pr.snapshot_json
        pr_txval = Decimal('0')
        pr_igst = Decimal('0')
        pr_cgst = Decimal('0')
        pr_sgst = Decimal('0')
        pr_cess = Decimal('0')

        for rate, vals in json_data.get('items_by_rate', {}).items():
            pr_txval += Decimal(str(vals.get('taxable_amount', 0)))
            pr_igst += Decimal(str(vals.get('igst', 0)))
            pr_cgst += Decimal(str(vals.get('cgst', 0)))
            pr_sgst += Decimal(str(vals.get('sgst', 0)))
            pr_cess += Decimal(str(vals.get('cess', 0)))

        val_tol = Decimal(str(GSTR3BValidationConfig.TOLERANCE_VALUE_TAX))
        date_tol = timedelta(days=GSTR3BValidationConfig.TOLERANCE_DATE_DAYS)

        if abs(pr_txval - r2b.taxable_value) > val_tol:
            mismatches.append("VALUE_MISMATCH")

        if (abs(pr_igst - r2b.igst) > val_tol or 
            abs(pr_cgst - r2b.cgst) > val_tol or 
            abs(pr_sgst - r2b.sgst) > val_tol or
            abs(pr_cess - r2b.cess) > val_tol):
            mismatches.append("TAX_MISMATCH")

        if abs(pr.document_date - r2b.invoice_date) > date_tol:
            mismatches.append("DATE_MISMATCH")
        elif pr.document_date.month != r2b.invoice_date.month or pr.document_date.year != r2b.invoice_date.year:
            mismatches.append("PERIOD_MISMATCH")

        # Tax rate mismatch check (hard constraint to 0%)
        rate_tol = Decimal('0')
        pr_total_tax = pr_igst + pr_cgst + pr_sgst + pr_cess
        r2b_total_tax = r2b.igst + r2b.cgst + r2b.sgst + r2b.cess
        
        pr_eff_rate = (pr_total_tax / pr_txval) if pr_txval else Decimal('0')
        r2b_eff_rate = (r2b_total_tax / r2b.taxable_value) if r2b.taxable_value else Decimal('0')
        
        # Round to avoid trivial floating point differences before strict comparison
        if round(pr_eff_rate, 4) != round(r2b_eff_rate, 4):
            mismatches.append("TAX_RATE_MISMATCH")

        if not exact:
            # Fuzzy match on invoice number — informational, does not block MATCHED status
            annotations.append("INVOICE_FORMAT_MISMATCH")

        if r2b.supplier_status.upper() != 'ACTIVE':
            mismatches.append("SUPPLIER_FLAGGED")

        # Combine blocking mismatches + annotations for storage
        all_reasons = mismatches + annotations

        if not mismatches:
            status = 'MATCHED'
            summary["matched"] += 1
            summary["total_itc_matched"] += float(pr_igst + pr_cgst + pr_sgst + pr_cess)
            # Mark as CLAIMED if it was deferred
            DeferredITCEntry.objects.filter(
                purchase_invoice_id=pr.document_id
            ).update(status='CLAIMED', claimed_period=run.period)
        else:
            status = 'MISMATCHED'
            summary["mismatched"] += 1

        results.append(ITCReconciliationResult(
            run=run,
            purchase_snapshot=pr,
            gstr2b_record=r2b,
            match_status=status,
            mismatch_reasons=all_reasons
        ))
