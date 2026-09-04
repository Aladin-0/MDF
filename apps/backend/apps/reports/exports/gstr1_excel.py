import os
import io
import json
import hashlib
import openpyxl
from decimal import Decimal
from datetime import datetime
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, NotFound

from apps.core.models import Outlet
from apps.reports.models import GSTExportAudit
from apps.reports.gstr_builders import GSTR1Builder

class GSTR1ExcelExportView(APIView):
    # Requires authentication and permission
    permission_classes = [IsAuthenticated]
    
    def get_current_outlet(self, request):
        return getattr(request.user, 'outlet', None)

    def get(self, request, fp):
        outlet = self.get_current_outlet(request)
        if not outlet:
            raise NotFound(detail="No outlet found")
            
        # Optional: check permissions
        is_admin_or_super = getattr(request.user, 'role', '') in ('admin', 'super_admin')
        can_export = getattr(request.user, 'can_export_gst', False)
        if not (is_admin_or_super or can_export):
            raise PermissionDenied(detail="Missing GST export permission")

        # Load Template Manifest
        template_dir = os.path.join(settings.BASE_DIR, 'resources', 'gst_templates')
        manifest_path = os.path.join(template_dir, 'template_manifest.json')
        
        if not os.path.exists(manifest_path):
            print("Template manifest not found:", manifest_path)
            raise NotFound(detail="Template manifest not found")
            
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
            
        template_path = os.path.join(template_dir, 'GSTR1_Excel_Workbook_Template_V2.2.xlsx')
        if not os.path.exists(template_path):
            print("Official template not found:", template_path)
            raise NotFound(detail="Official template not found")

        # Build JSON
        b1 = GSTR1Builder(outlet.gstin, fp)
        payload = b1.generate_json()
        
        # Check validation state
        metadata = payload.get('_metadata', {})
        blocking_errors = metadata.get('blocking_errors', [])
        
        if blocking_errors:
            print("Blocking errors (suppressed 422 for Download & Warn):", blocking_errors)
            
        gstr1_manifest = manifest.get('GSTR1', {})
        sheet_meta = {m['name']: m for m in gstr1_manifest.get('sheets', [])}
        
        file_ext = "." + gstr1_manifest.get('extension', 'xlsx').lower()
        if file_ext == '.xls':
            return JsonResponse({"error": "Legacy .xls template is not supported. Please provide a newer .xlsx or .xlsm template."}, status=400)
            
        print("DEBUG PAYLOAD:", payload)
        data_map = {}
        
        # Map B2B
        if 'b2b,sez,de' in sheet_meta and payload.get('b2b'):
            rows = []
            total_taxable = Decimal('0.00')
            total_cess = Decimal('0.00')
            for b in payload['b2b']:
                gstin = b.get('ctin')
                for inv in b.get('inv', []):
                    inum = inv.get('inum')
                    idt = inv.get('idt')
                    val = inv.get('val')
                    pos = inv.get('pos')
                    inv_typ = inv.get('inv_typ')
                    for itm in inv.get('itms', []):
                        rt = itm.get('itm_det', {}).get('rt')
                        txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                        cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                        
                        total_taxable += txval
                        total_cess += cess
                        
                        rows.append({
                            1: gstin,
                            2: "", # Receiver Name
                            3: inum,
                            4: idt,
                            5: Decimal(str(val)) if val is not None else Decimal('0.00'),
                            6: pos if pos else "27-Maharashtra",
                            7: "N", # Reverse Charge
                            8: "", # Applicable % of Tax Rate
                            9: inv_typ,
                            10: "", # E-Commerce
                            11: Decimal(str(rt)) if rt is not None else Decimal('0.00'),
                            12: txval,
                            13: cess if cess else "" # Cess
                        })
            if rows:
                data_map['b2b,sez,de'] = [
                    {"start_row": 2, "rows": [{12: total_taxable, 13: total_cess}]},
                    {"start_row": 5, "rows": rows}
                ]
                        
        # Map B2CS
        if 'b2cs' in sheet_meta and payload.get('b2cs'):
            rows = []
            total_taxable = Decimal('0.00')
            total_cess = Decimal('0.00')
            for b in payload['b2cs']:
                typ = b.get('typ')
                pos = b.get('pos')
                rt = b.get('rt')
                txval = Decimal(str(b.get('txval', 0) or 0))
                cess = Decimal(str(b.get('csamt', 0) or 0))
                
                total_taxable += txval
                total_cess += cess
                
                rows.append({
                    1: typ,
                    2: pos if pos else "27-Maharashtra",
                    3: "", # Applicable % of Tax Rate
                    4: Decimal(str(rt)) if rt is not None else Decimal('0.00'),
                    5: txval,
                    6: cess if cess else "", # Cess
                    7: "" # E-Commerce
                })
            if rows:
                data_map['b2cs'] = [
                    {"start_row": 2, "rows": [{5: total_taxable, 6: total_cess}]},
                    {"start_row": 5, "rows": rows}
                ]
                
        # Map B2CL
        if 'b2cl' in sheet_meta and payload.get('b2cl'):
            rows = []
            total_taxable = Decimal('0.00')
            total_cess = Decimal('0.00')
            for b in payload['b2cl']:
                pos = b.get('pos')
                for inv in b.get('inv', []):
                    inum = inv.get('inum')
                    idt = inv.get('idt')
                    val = inv.get('val')
                    for itm in inv.get('itms', []):
                        rt = itm.get('itm_det', {}).get('rt')
                        txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                        cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                        
                        total_taxable += txval
                        total_cess += cess
                        
                        rows.append({
                            1: inum,
                            2: idt,
                            3: Decimal(str(val)) if val is not None else Decimal('0.00'),
                            4: pos if pos else "27-Maharashtra",
                            5: "", # Applicable % of Tax Rate
                            6: Decimal(str(rt)) if rt is not None else Decimal('0.00'),
                            7: txval,
                            8: cess if cess else "", # Cess
                            9: "" # E-Commerce
                        })
            if rows:
                data_map['b2cl'] = [
                    {"start_row": 2, "rows": [{7: total_taxable, 8: total_cess}]},
                    {"start_row": 5, "rows": rows}
                ]
                        
        # Map CDNR
        if 'cdnr' in sheet_meta and payload.get('cdnr'):
            rows = []
            total_taxable = Decimal('0.00')
            total_cess = Decimal('0.00')
            for b in payload['cdnr']:
                gstin = b.get('ctin')
                for nt in b.get('nt', []):
                    nt_num = nt.get('nt_num')
                    nt_dt = nt.get('nt_dt')
                    nt_ty = nt.get('ntty') or nt.get('nt_ty')
                    p_gst = nt.get('p_gst')
                    val = nt.get('val')
                    pos = nt.get('pos') or "" # POS can be at note level
                    for itm in nt.get('itms', []):
                        rt = itm.get('itm_det', {}).get('rt')
                        txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                        cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                        
                        total_taxable += txval
                        total_cess += cess
                        
                        rows.append({
                            1: gstin,
                            2: "", # Receiver Name
                            3: nt_num,
                            4: nt_dt,
                            5: nt_ty,
                            6: pos if pos else "27-Maharashtra", # POS
                            7: "N", # Reverse Charge
                            8: "Regular", # Note Supply Type
                            9: Decimal(str(val)) if val is not None else Decimal('0.00'),
                            10: "", # Applicable % of Tax Rate
                            11: Decimal(str(rt)) if rt is not None else Decimal('0.00'),
                            12: txval,
                            13: cess if cess else "" # Cess
                        })
            if rows:
                data_map['cdnr'] = [
                    {"start_row": 2, "rows": [{12: total_taxable, 13: total_cess}]},
                    {"start_row": 5, "rows": rows}
                ]
                        
        # Map CDNUR
        if 'cdnur' in sheet_meta and payload.get('cdnur'):
            rows = []
            total_taxable = Decimal('0.00')
            total_cess = Decimal('0.00')
            for b in payload['cdnur']:
                typ = b.get('typ')
                nt_num = b.get('nt_num')
                nt_dt = b.get('nt_dt')
                nt_ty = b.get('ntty') or b.get('nt_ty')
                val = b.get('val')
                pos = b.get('pos')
                for itm in b.get('itms', []):
                    rt = itm.get('itm_det', {}).get('rt')
                    txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                    cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                    
                    total_taxable += txval
                    total_cess += cess
                    
                    rows.append({
                        1: typ,
                        2: nt_num,
                        3: nt_dt,
                        4: nt_ty,
                        5: pos if pos else "27-Maharashtra",
                        6: Decimal(str(val)) if val is not None else Decimal('0.00'),
                        7: "", # Applicable % of Tax Rate
                        8: Decimal(str(rt)) if rt is not None else Decimal('0.00'),
                        9: txval,
                        10: cess if cess else "" # Cess
                    })
            if rows:
                data_map['cdnur'] = [
                    {"start_row": 2, "rows": [{9: total_taxable, 10: total_cess}]},
                    {"start_row": 5, "rows": rows}
                ]

        # Map HSN(B2B) and HSN(B2C) via Aggregation
        from apps.reports.models import GSTTransactionSnapshot
        hsn_agg = {}
        
        # Query all outward supplies (sales and sales returns/credit notes) for the period
        snapshots = GSTTransactionSnapshot.objects.filter(
            outlet=outlet, 
            period=fp, 
            transaction_type__in=['sale', 'sales_return', 'sales_credit_note']
        )
        
        for snap in snapshots:
            snap_json = snap.snapshot_json
            # Determine the multiplier: sales add to the total, returns subtract from it
            multiplier = Decimal('-1.0') if snap.transaction_type in ['sales_return', 'sales_credit_note'] else Decimal('1.0')
            
            bucket = 'B2C'
            explicit_classification = snap_json.get('hsn_recipient_classification')
            if explicit_classification in ['B2B', 'B2C']:
                bucket = explicit_classification
            else:
                if snap.transaction_type in ['sales_return', 'sales_credit_note']:
                    orig_cls = snap_json.get('original_supply_classification')
                    if orig_cls == 'B2B':
                        bucket = 'B2B'
                else:
                    if snap_json.get('is_b2b') is True:
                        bucket = 'B2B'
            
            sheet_key = 'hsn(b2b)' if bucket == 'B2B' else 'hsn(b2c)'
            
            for item in snap_json.get('items', []):
                hsn_sc = item.get('hsn_sc', '0000')
                if not hsn_sc:
                    hsn_sc = "0000"
                    
                rt = float(item.get('rt') or 0.0)
                uqc = item.get('uqc', 'NOS')
                
                # Group by Sheet, HSN, UQC, and Rate
                agg_key = (sheet_key, hsn_sc, uqc, rt)
                
                if agg_key not in hsn_agg:
                    hsn_agg[agg_key] = {
                        'hsn_sc': hsn_sc,
                        'desc': item.get('desc', 'Medicines'),
                        'uqc': uqc,
                        'qty': Decimal("0.00"),
                        'val': Decimal("0.00"),
                        'rt': Decimal(str(rt)),
                        'txval': Decimal("0.00"),
                        'iamt': Decimal("0.00"),
                        'camt': Decimal("0.00"),
                        'samt': Decimal("0.00"),
                        'csamt': Decimal("0.00")
                    }
                
                # Extract and multiply values
                qty = Decimal(str(item.get('qty', 0))) * multiplier
                txval = Decimal(str(item.get('txval', 0))) * multiplier
                iamt = Decimal(str(item.get('iamt', 0))) * multiplier
                camt = Decimal(str(item.get('camt', 0))) * multiplier
                samt = Decimal(str(item.get('samt', 0))) * multiplier
                csamt = Decimal(str(item.get('csamt', 0))) * multiplier
                
                hsn_agg[agg_key]['qty'] += qty
                hsn_agg[agg_key]['txval'] += txval
                hsn_agg[agg_key]['iamt'] += iamt
                hsn_agg[agg_key]['camt'] += camt
                hsn_agg[agg_key]['samt'] += samt
                hsn_agg[agg_key]['csamt'] += csamt
                hsn_agg[agg_key]['val'] += (txval + iamt + camt + samt + csamt)

        # Write to the separated 'hsn(b2b)' and 'hsn(b2c)' sheets
        for sheet_name in ['hsn(b2b)', 'hsn(b2c)']:
            if sheet_name in sheet_meta:
                rows = []
                total_hsn_count = 0
                total_val, total_txval = Decimal("0.00"), Decimal("0.00")
                total_iamt, total_camt, total_samt, total_csamt = Decimal("0.00"), Decimal("0.00"), Decimal("0.00"), Decimal("0.00")
            
                for (s_key, hsn_sc, uqc, rt), data in hsn_agg.items():
                    if s_key != sheet_name:
                        continue
                        
                    # Only output rows with non-zero quantity or value to avoid empty lines from perfectly cancelled returns
                    if data['qty'] != 0 or data['val'] != 0:
                        total_hsn_count += 1
                        total_val += data['val']
                        total_txval += data['txval']
                        total_iamt += data['iamt']
                        total_camt += data['camt']
                        total_samt += data['samt']
                        total_csamt += data['csamt']
                        
                        rows.append({
                            1: data['hsn_sc'],
                            2: data['desc'],
                            3: data['uqc'],
                            4: data['qty'],
                            5: data['val'],
                            6: data['rt'],
                            7: data['txval'],
                            8: data['iamt'],
                            9: data['camt'],
                            10: data['samt'],
                            11: data['csamt']
                        })
                        
                if rows:
                    data_map[sheet_name] = [
                        # Inject summary headers (Row 3)
                        {"start_row": 3, "rows": [{
                            1: total_hsn_count, 5: total_val, 7: total_txval, 
                            8: total_iamt, 9: total_camt, 10: total_samt, 11: total_csamt
                        }]},
                        # Inject data rows
                        {"start_row": 5, "rows": rows}
                    ]
                
        print("DATA MAP:", data_map)
        
        from apps.reports.validators import ExporterPreflightValidator
        validator = ExporterPreflightValidator(data_map)
        preflight_errors = validator.validate()
        if preflight_errors:
            print("Preflight warnings (suppressed 422 for Download & Warn):", preflight_errors)
                
        # Inject Data using OOXMLInjector
        from apps.reports.exports.ooxml_injector import OOXMLInjector
        injector = OOXMLInjector(template_path)
        out_stream = io.BytesIO()
        injector.inject(data_map, out_stream)
        out_bytes = out_stream.getvalue()
        
        # Calculate hashes
        source_json_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        output_file_hash = hashlib.sha256(out_bytes).hexdigest()
        
        # Record Audit Log
        timestamp = datetime.now()
        GSTExportAudit.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            outlet=outlet,
            period=fp,
            export_type='GSTR1_EXCEL',
            template_checksum=gstr1_manifest.get('sha256'),
            template_version=gstr1_manifest.get('version'),
            source_json_hash=source_json_hash,
            output_file_hash=output_file_hash,
            validation_state={"warnings": metadata.get('validation_warnings', [])}
        )
        
        # Prepare HttpResponse
        content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        if file_ext == '.xlsm':
            content_type = 'application/vnd.ms-excel.sheet.macroEnabled.12'
            
        response = HttpResponse(out_bytes, content_type=content_type)
        
        filename = f"GSTR1_{outlet.gstin}_{fp}_{timestamp.strftime('%Y%m%d%H%M%S')}{file_ext}"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
