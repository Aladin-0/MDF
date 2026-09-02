import json
from decimal import Decimal
from django.http import JsonResponse, HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.models import Outlet
from apps.reports.models import GSTTransactionSnapshot, ITCReconciliationRun, ITCReconciliationResult, DeferredITCEntry
from apps.reports.gstr_builders import GSTR1Builder, GSTR3BBuilder
from apps.reports.gstr2b_service import GSTR2BService

def get_current_outlet(request):
    return getattr(request.user, 'outlet', None)

class GSTPeriodsView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        outlet = get_current_outlet(request)
        if not outlet:
            return Response([])

        # Fetch unique periods from snapshots
        periods = GSTTransactionSnapshot.objects.filter(outlet=outlet).values_list('period', flat=True).distinct().order_by('-period')
        
        result = []
        for p in periods:
            # Check status (draft if any blocking errors)
            b1 = GSTR1Builder(outlet.gstin, p)
            p1 = b1.generate_json()
            b3 = GSTR3BBuilder(outlet.gstin, p)
            p3 = b3.generate_json()
            
            b1_blocking = p1.get('_metadata', {}).get('blocking_errors', [])
            b3_blocking = p3.get('_metadata', {}).get('blocking_errors', [])
            
            status = 'draft' if b1_blocking or b3_blocking else 'validated'
            result.append({"period": p, "status": status})
            
        return Response(result)

class GSTSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        outlet = get_current_outlet(request)
        if not outlet:
            return Response({"error": "No outlet found"}, status=404)
            
        start = request.query_params.get('start')
        end = request.query_params.get('end')
            
        # GSTR-1
        b1 = GSTR1Builder(outlet.gstin, period=None, start_date=start, end_date=end)
        payload1 = b1.generate_json()
        
        b2b_total = sum(i.get('itm_det', {}).get('txval', 0) for b in payload1.get('b2b', []) for inv in b.get('inv', []) for i in inv.get('itms', []))
        b2cs_total = sum(b.get('txval', 0) for b in payload1.get('b2cs', []))
        b2cl_total = sum(i.get('itm_det', {}).get('txval', 0) for b in payload1.get('b2cl', []) for inv in b.get('inv', []) for i in inv.get('itms', []))
        cdnr_total = sum(i.get('itm_det', {}).get('txval', 0) for b in payload1.get('cdnr', []) for nt in b.get('nt', []) for i in nt.get('itms', []))
        cdnur_total = sum(i.get('itm_det', {}).get('txval', 0) for b in payload1.get('cdnur', []) for i in b.get('itms', []))
        hsn_count = len(payload1.get('hsn', {}).get('data', []))
        
        # GSTR-3B
        b3 = GSTR3BBuilder(outlet.gstin, period=None, start_date=start, end_date=end)
        payload3 = b3.generate_json()
        
        sup = payload3.get('sup_details', {})
        osup_det = sup.get('osup_det', {})
        outward_tax = {
            'igst': osup_det.get('iamt', 0),
            'cgst': osup_det.get('camt', 0),
            'sgst': osup_det.get('samt', 0),
            'total': osup_det.get('iamt', 0) + osup_det.get('camt', 0) + osup_det.get('samt', 0)
        }
        
        itc_net_data = payload3.get('itc_elg', {}).get('itc_net', {})
        net_itc = {
            'igst': itc_net_data.get('iamt', 0),
            'cgst': itc_net_data.get('camt', 0),
            'sgst': itc_net_data.get('samt', 0),
            'total': itc_net_data.get('iamt', 0) + itc_net_data.get('camt', 0) + itc_net_data.get('samt', 0)
        }
        
        cash_payable = {
            'igst': max(0, outward_tax['igst'] - net_itc['igst']),
            'cgst': max(0, outward_tax['cgst'] - net_itc['cgst']),
            'sgst': max(0, outward_tax['sgst'] - net_itc['sgst']),
        }
        cash_payable['total'] = cash_payable['igst'] + cash_payable['cgst'] + cash_payable['sgst']

        m1 = payload1.get('_metadata', {})
        m3 = payload3.get('_metadata', {})
        
        blocking = m1.get('blocking_errors', []) + m3.get('blocking_errors', [])
        warnings = m1.get('validation_warnings', []) + m3.get('validation_warnings', [])
        info = m1.get('info', []) + m3.get('info', [])
        is_valid = m1.get('is_valid_for_export', True) and m3.get('is_valid_for_export', True)

        return Response({
            "gstr1": {
                "b2b_total": b2b_total,
                "b2cs_total": b2cs_total,
                "b2cl_total": b2cl_total,
                "cdnr_total": cdnr_total,
                "cdnur_total": cdnur_total,
                "hsn_count": hsn_count
            },
            "gstr3b": {
                "outward_tax": outward_tax,
                "net_itc": net_itc,
                "cash_payable": cash_payable,
                "sup_details": payload3.get('sup_details', {}),
                "itc_elg": payload3.get('itc_elg', {})
            },
            "validation": {
                "is_valid_for_export": is_valid,
                "blocking_errors": blocking,
                "warnings": warnings,
                "info": info
            },
            "mom_delta": {
                "outward_tax_change_pct": 0, # Mocked for MVP
                "net_itc_change_pct": 0
            }
        })

class GSTReconciliationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, fp):
        outlet = get_current_outlet(request)
        if not outlet:
            return Response({"error": "No outlet found"}, status=404)
            
        run = ITCReconciliationRun.objects.filter(outlet=outlet, period=fp).last()
        if not run:
            return Response({
                "summary": {"matched_count": 0, "matched_tax_amount": 0, "missing_in_2b_count": 0, "missing_in_2b_tax_amount": 0, "mismatched_count": 0, "mismatched_tax_amount": 0},
                "mismatch_breakdown": {},
                "deferred_itc": {"opening_balance": 0, "added_this_period": 0, "claimed_this_period": 0, "closing_balance": 0, "caption": "No deferred ITC data."},
                "top_mismatches": []
            })
            
        results = ITCReconciliationResult.objects.filter(run=run)
        
        matched = results.filter(match_status='MATCHED')
        missing = results.filter(match_status='MISSING_IN_2B')
        mismatched = results.filter(match_status='MISMATCHED')
        
        def get_tax(qs):
            total = 0
            for r in qs:
                if r.purchase_snapshot:
                    items = r.purchase_snapshot.snapshot_json.get('items_by_rate', {})
                    for rt, d in items.items():
                        total += d.get('igst', 0) + d.get('cgst', 0) + d.get('sgst', 0)
            return total
            
        summary = {
            "matched_count": matched.count(),
            "matched_tax_amount": get_tax(matched),
            "missing_in_2b_count": missing.count(),
            "missing_in_2b_tax_amount": get_tax(missing),
            "mismatched_count": mismatched.count(),
            "mismatched_tax_amount": get_tax(mismatched)
        }
        
        breakdown = {}
        top_mismatches = []
        for r in mismatched:
            tax = get_tax([r])
            for reason in r.mismatch_reasons:
                breakdown[reason] = breakdown.get(reason, 0) + 1
            
            top_mismatches.append({
                "supplier_gstin": r.purchase_snapshot.snapshot_json.get('distributor_gstin') if r.purchase_snapshot else "",
                "invoice_no": r.purchase_snapshot.document_number if r.purchase_snapshot else "",
                "invoice_date": r.purchase_snapshot.document_date if r.purchase_snapshot else "",
                "taxable_value": sum(d.get('taxable_amount', 0) for d in r.purchase_snapshot.snapshot_json.get('items_by_rate', {}).values()) if r.purchase_snapshot else 0,
                "tax_amount": tax,
                "mismatch_reason": ", ".join(r.mismatch_reasons)
            })
            
        top_mismatches = sorted(top_mismatches, key=lambda x: x['tax_amount'], reverse=True)[:5]
        
        deferred = DeferredITCEntry.objects.filter(purchase_invoice__outlet=outlet, original_period=fp)
        added = sum(float(d.iamt or 0) + float(d.camt or 0) + float(d.samt or 0) for d in deferred)
        claimed = sum(float(d.iamt or 0) + float(d.camt or 0) + float(d.samt or 0) for d in DeferredITCEntry.objects.filter(purchase_invoice__outlet=outlet, claimed_period=fp))
        
        stats = {
            "total_invoices": matched.count() + missing.count() + mismatched.count(),
            "matched": matched.count(),
            "missing_in_2b": missing.count(),
            "mismatched": mismatched.count()
        }
        
        return Response({
            "status": "COMPLETED" if run else "PENDING",
            "stats": stats,
            "summary": summary,
            "mismatch_breakdown": breakdown,
            "deferred_itc": {
                "opening_balance": 0, # Mocked opening balance logic for MVP
                "newly_deferred": added,
                "claimed_this_period": claimed,
                "total_deferred_balance": added - claimed,
                "caption": "Deferred ITC summary for the period."
            },
            "top_mismatches": top_mismatches
        })

class GSTExportView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request, fp, export_type):
        outlet = get_current_outlet(request)
        if not outlet:
            return Response({"error": "No outlet found"}, status=404)
            
        if export_type == 'gstr1':
            b = GSTR1Builder(outlet.gstin, fp)
            payload = b.generate_json()
            response = HttpResponse(json.dumps(payload, indent=2), content_type='application/json')
            response['Content-Disposition'] = f'attachment; filename="gstr1_{fp}.json"'
            return response
        elif export_type == 'gstr3b':
            b = GSTR3BBuilder(outlet.gstin, fp)
            payload = b.generate_json()
            response = HttpResponse(json.dumps(payload, indent=2), content_type='application/json')
            response['Content-Disposition'] = f'attachment; filename="gstr3b_{fp}.json"'
            return response
        elif export_type == 'reconciliation':
            # Simple CSV
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="reconciliation_{fp}.csv"'
            import csv
            writer = csv.writer(response)
            writer.writerow(['GSTIN', 'Invoice No', 'Status', 'Reasons'])
            
            run = ITCReconciliationRun.objects.filter(outlet=outlet, period=fp).last()
            if run:
                results = ITCReconciliationResult.objects.filter(run=run)
                for r in results:
                    gstin = r.purchase_snapshot.snapshot_json.get('distributor_gstin', '') if r.purchase_snapshot else ''
                    inv = r.purchase_snapshot.document_number if r.purchase_snapshot else ''
                    writer.writerow([gstin, inv, r.match_status, ", ".join(r.mismatch_reasons)])
            return response
        return Response({"error": "Invalid export type"}, status=400)
