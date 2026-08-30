import json
from datetime import datetime
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, NotFound

from apps.core.models import Outlet
from apps.reports.models import GSTExportAudit, ITCReconciliationRun, ITCReconciliationResult

class GSTR2BJsonExportView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get_current_outlet(self, request):
        return getattr(request.user, 'outlet', None)

    def get(self, request, fp):
        outlet = self.get_current_outlet(request)
        if not outlet:
            raise NotFound(detail="No outlet found")
            
        if not request.user.has_perm('reports.export_gst') and not request.user.is_superuser:
            raise PermissionDenied(detail="Missing GST export permission")

        run = ITCReconciliationRun.objects.filter(outlet=outlet, period=fp).order_by('-run_date').first()
        if not run:
            raise NotFound(detail="No reconciliation run found for this period")

        records = ITCReconciliationResult.objects.filter(run=run).select_related('purchase_snapshot', 'gstr2b_record')
        
        payload = {
            "gstin": outlet.gstin,
            "fp": fp,
            "b2b": [],
            "cdnr": []
        }
        
        b2b_map = {}
        cdnr_map = {}
        
        def add_to_map(data_map, gstin, inv):
            if gstin not in data_map:
                data_map[gstin] = []
            data_map[gstin].append(inv)
        
        for r in records:
            if r.match_status == 'MISSING_IN_PR':
                g2b = r.gstr2b_record
                if not g2b: continue
                gstin = g2b.supplier_gstin
                inv_no = g2b.invoice_number
                inv_date = g2b.invoice_date.strftime('%d-%m-%Y') if g2b.invoice_date else ''
                val = g2b.taxable_value + g2b.igst + g2b.cgst + g2b.sgst + g2b.cess
                rt = g2b.raw_data.get('rt', 0) if isinstance(g2b.raw_data, dict) else 0
                
                itm = {
                    "num": 1,
                    "itm_det": {
                        "rt": float(rt),
                        "txval": float(g2b.taxable_value),
                        "iamt": float(g2b.igst),
                        "camt": float(g2b.cgst),
                        "samt": float(g2b.sgst),
                        "csamt": float(g2b.cess)
                    }
                }
                
                if g2b.document_type in ['C', 'D']:
                    add_to_map(cdnr_map, gstin, {
                        "nt_num": inv_no,
                        "nt_dt": inv_date,
                        "nt_ty": g2b.document_type,
                        "val": float(val),
                        "itms": [itm]
                    })
                else:
                    add_to_map(b2b_map, gstin, {
                        "inum": inv_no,
                        "idt": inv_date,
                        "val": float(val),
                        "pos": "",
                        "inv_typ": "R",
                        "itms": [itm]
                    })
                    
            elif r.match_status in ['MATCHED', 'MATCHED_WITH_TOLERANCE', 'MISSING_IN_2B']:
                pr = r.purchase_snapshot
                if not pr or not pr.snapshot_json: continue
                snap = pr.snapshot_json
                gstin = snap.get('distributor_gstin') or pr.gstin
                inv_no = pr.document_number
                try:
                    inv_date = pr.document_date.strftime('%d-%m-%Y')
                except:
                    inv_date = str(pr.document_date)
                    
                pos = snap.get('pos', '')
                items = snap.get('items_by_rate', {})
                
                itms = []
                total_val = 0
                for idx, (rt_str, item) in enumerate(items.items(), start=1):
                    txval = float(item.get('taxable_amount', 0))
                    iamt = float(item.get('igst', 0))
                    camt = float(item.get('cgst', 0))
                    samt = float(item.get('sgst', 0))
                    csamt = float(item.get('cess', 0))
                    total_val += (txval + iamt + camt + samt + csamt)
                    
                    itms.append({
                        "num": idx,
                        "itm_det": {
                            "rt": float(rt_str),
                            "txval": txval,
                            "iamt": iamt,
                            "camt": camt,
                            "samt": samt,
                            "csamt": csamt
                        }
                    })
                    
                if pr.transaction_type in ['purchase_credit_note', 'purchase_debit_note']:
                    add_to_map(cdnr_map, gstin, {
                        "nt_num": inv_no,
                        "nt_dt": inv_date,
                        "nt_ty": "C" if 'credit' in pr.transaction_type else "D",
                        "val": total_val,
                        "itms": itms
                    })
                else:
                    add_to_map(b2b_map, gstin, {
                        "inum": inv_no,
                        "idt": inv_date,
                        "val": total_val,
                        "pos": pos,
                        "inv_typ": "R",
                        "itms": itms
                    })
                    
        for gstin, invs in b2b_map.items():
            payload["b2b"].append({
                "ctin": gstin,
                "inv": invs
            })
            
        for gstin, invs in cdnr_map.items():
            payload["cdnr"].append({
                "ctin": gstin,
                "nt": invs
            })
            
        out_bytes = json.dumps(payload, indent=2).encode('utf-8')
        
        # Record Audit
        import hashlib
        output_file_hash = hashlib.sha256(out_bytes).hexdigest()
        GSTExportAudit.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            outlet=outlet,
            period=fp,
            export_type='GSTR2B_JSON',
            output_file_hash=output_file_hash,
            validation_state={}
        )
        
        timestamp = datetime.now()
        filename = f"GSTR2B_{outlet.gstin}_{fp}_{timestamp.strftime('%Y%m%d%H%M%S')}.json"
        response = HttpResponse(out_bytes, content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
