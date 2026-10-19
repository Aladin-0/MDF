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
import re

def safe_pos(pos_val, outlet_gstin):
    fallback = str(outlet_gstin)[:2] if outlet_gstin and len(str(outlet_gstin)) >= 2 else ""
    if not pos_val: return fallback
    m = re.search(r'\d{2}', str(pos_val))
    return m.group(0) if m else fallback

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

        start_date = request.query_params.get('start_date') or request.query_params.get('start') or request.query_params.get('from')
        end_date = request.query_params.get('end_date') or request.query_params.get('end') or request.query_params.get('to')
        
        if not (start_date and end_date) and fp and len(fp) == 6:
            try:
                month = int(fp[:2])
                year = int(fp[2:])
                import calendar
                _, last_day = calendar.monthrange(year, month)
                start_date = f"{year:04d}-{month:02d}-01"
                end_date = f"{year:04d}-{month:02d}-{last_day:02d}"
            except Exception:
                pass

        # Ensure SaleInvoices in date range have up-to-date snapshots
        try:
            from apps.billing.models import SaleInvoice
            from apps.reports.models import GSTTransactionSnapshot
            from apps.reports.gst_snapshot_service import create_sale_snapshots
            inv_qs_missing = SaleInvoice.objects.filter(outlet=outlet, is_return=False)
            if start_date:
                inv_qs_missing = inv_qs_missing.filter(invoice_date__gte=start_date)
            if end_date:
                inv_qs_missing = inv_qs_missing.filter(invoice_date__lte=end_date)
            
            existing_snap_ids = set(
                GSTTransactionSnapshot.objects.filter(
                    outlet=outlet,
                    transaction_type='sale'
                ).values_list('document_id', flat=True)
            )
            for inv in inv_qs_missing:
                if inv.id not in existing_snap_ids:
                    try:
                        create_sale_snapshots(inv)
                    except Exception:
                        pass
        except Exception:
            pass

        # Build JSON
        b1 = GSTR1Builder(outlet.gstin, period=fp, start_date=start_date, end_date=end_date)
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
        
        if 'b2b,sez,de' in sheet_meta and payload.get('b2b'):
            rows = []
            unique_recipients = set()
            unique_invoices = set()
            total_invoice_val = Decimal('0.00')
            total_taxable_val = Decimal('0.00')
            total_cess_val = Decimal('0.00')

            for b in payload['b2b']:
                gstin = b.get('ctin')
                if gstin:
                    unique_recipients.add(gstin)
                for inv in b.get('inv', []):
                    inum = inv.get('inum')
                    idt = inv.get('idt')
                    val = inv.get('val')
                    pos = inv.get('pos')
                    inv_typ = inv.get('inv_typ')
                    
                    inv_key = (gstin, inum)
                    if inv_key not in unique_invoices:
                        unique_invoices.add(inv_key)
                        if val is not None:
                            total_invoice_val += Decimal(str(val))

                    sorted_itms = sorted(
                        inv.get('itms', []),
                        key=lambda itm: Decimal(str(itm.get('itm_det', {}).get('rt', 0) or 0))
                    )
                    for itm in sorted_itms:
                        det = itm.get('itm_det', {})
                        rt = det.get('rt')
                        txval = Decimal(str(det.get('txval', 0) or 0))
                        cess = Decimal(str(det.get('csamt', 0) or 0))

                        total_taxable_val += txval
                        total_cess_val += cess
                        
                        formatted_rate = Decimal(str(rt)).quantize(Decimal('0.01')) if rt is not None else Decimal('0.00')
                        rows.append({
                            1: gstin,
                            2: "", # Receiver Name
                            3: inum,
                            4: idt,
                            5: round(Decimal(str(val)), 2) if val is not None else Decimal('0.00'),
                            6: safe_pos(pos, outlet.gstin),
                            7: "N", # Reverse Charge
                            8: "", # Applicable % of Tax Rate
                            9: inv_typ,
                            10: "", # E-Commerce
                            11: formatted_rate,
                            12: round(txval, 2),
                            13: round(cess, 2) if cess else "" # Cess
                        })
            if rows:
                data_map['b2b,sez,de'] = [
                    {"start_row": 3, "rows": [{
                        1: len(unique_recipients),
                        3: len(unique_invoices),
                        5: round(total_invoice_val, 2),
                        12: round(total_taxable_val, 2),
                        13: round(total_cess_val, 2)
                    }]},
                    {"start_row": 5, "rows": rows}
                ]
                        
        if 'b2cs' in sheet_meta and payload.get('b2cs'):
            rows = []
            total_txval = Decimal('0.00')
            total_cess = Decimal('0.00')
            # Sort explicitly ascending by GST Rate key, then POS
            sorted_b2cs = sorted(
                payload['b2cs'],
                key=lambda b: (Decimal(str(b.get('rt') or 0)), str(b.get('pos') or ''))
            )
            for b in sorted_b2cs:
                typ = b.get('typ')
                pos = b.get('pos')
                rt = b.get('rt')
                txval = Decimal(str(b.get('txval', 0) or 0))
                cess = Decimal(str(b.get('csamt', 0) or 0))
                
                total_txval += txval
                total_cess += cess
                
                formatted_rate = Decimal(str(rt)).quantize(Decimal('0.01')) if rt is not None else Decimal('0.00')
                rows.append({
                    1: typ,
                    2: safe_pos(pos, outlet.gstin),
                    3: "", # Applicable % of Tax Rate
                    4: formatted_rate,
                    5: round(txval, 2),
                    6: round(cess, 2) if cess else "", # Cess
                    7: "" # E-Commerce
                })
            if rows:
                data_map['b2cs'] = [
                    {"start_row": 3, "rows": [{5: round(total_txval, 2), 6: round(total_cess, 2)}]},
                    {"start_row": 5, "rows": rows}
                ]
                
        if 'b2cl' in sheet_meta and payload.get('b2cl'):
            rows = []
            for b in payload['b2cl']:
                pos = b.get('pos')
                for inv in b.get('inv', []):
                    inum = inv.get('inum')
                    idt = inv.get('idt')
                    val = inv.get('val')
                    sorted_itms = sorted(
                        inv.get('itms', []),
                        key=lambda itm: Decimal(str(itm.get('itm_det', {}).get('rt', 0) or 0))
                    )
                    for itm in sorted_itms:
                        rt = itm.get('itm_det', {}).get('rt')
                        txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                        cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                        
                        formatted_rate = Decimal(str(rt)).quantize(Decimal('0.01')) if rt is not None else Decimal('0.00')
                        rows.append({
                            1: inum,
                            2: idt,
                            3: round(Decimal(str(val)), 2) if val is not None else Decimal('0.00'),
                            4: safe_pos(pos, outlet.gstin),
                            5: "", # Applicable % of Tax Rate
                            6: formatted_rate,
                            7: round(txval, 2),
                            8: round(cess, 2) if cess else "", # Cess
                            9: "" # E-Commerce
                        })
            if rows:
                data_map['b2cl'] = [
                    {"start_row": 5, "rows": rows}
                ]
                        
        if 'cdnr' in sheet_meta and payload.get('cdnr'):
            rows = []
            for b in payload['cdnr']:
                gstin = b.get('ctin')
                for nt in b.get('nt', []):
                    nt_num = nt.get('nt_num')
                    nt_dt = nt.get('nt_dt')
                    nt_ty = nt.get('ntty') or nt.get('nt_ty')
                    p_gst = nt.get('p_gst')
                    val = nt.get('val')
                    pos = nt.get('pos') or "" # POS can be at note level
                    sorted_itms = sorted(
                        nt.get('itms', []),
                        key=lambda itm: Decimal(str(itm.get('itm_det', {}).get('rt', 0) or 0))
                    )
                    for itm in sorted_itms:
                        rt = itm.get('itm_det', {}).get('rt')
                        txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                        cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                        
                        formatted_rate = Decimal(str(rt)).quantize(Decimal('0.01')) if rt is not None else Decimal('0.00')
                        rows.append({
                            1: gstin,
                            2: "", # Receiver Name
                            3: nt_num,
                            4: nt_dt,
                            5: nt_ty,
                            6: safe_pos(pos, outlet.gstin), # POS
                            7: "N", # Reverse Charge
                            8: "Regular", # Note Supply Type
                            9: round(Decimal(str(val)), 2) if val is not None else Decimal('0.00'),
                            10: "", # Applicable % of Tax Rate
                            11: formatted_rate,
                            12: round(txval, 2),
                            13: round(cess, 2) if cess else "" # Cess
                        })
            if rows:
                data_map['cdnr'] = [
                    {"start_row": 5, "rows": rows}
                ]
                        
        if 'cdnur' in sheet_meta and payload.get('cdnur'):
            rows = []
            for b in payload['cdnur']:
                typ = b.get('typ')
                nt_num = b.get('nt_num')
                nt_dt = b.get('nt_dt')
                nt_ty = b.get('ntty') or b.get('nt_ty')
                val = b.get('val')
                pos = b.get('pos')
                sorted_itms = sorted(
                    b.get('itms', []),
                    key=lambda itm: Decimal(str(itm.get('itm_det', {}).get('rt', 0) or 0))
                )
                for itm in sorted_itms:
                    rt = itm.get('itm_det', {}).get('rt')
                    txval = Decimal(str(itm.get('itm_det', {}).get('txval') or 0))
                    cess = Decimal(str(itm.get('itm_det', {}).get('csamt') or 0))
                    
                    formatted_rate = Decimal(str(rt)).quantize(Decimal('0.01')) if rt is not None else Decimal('0.00')
                    rows.append({
                        1: typ,
                        2: nt_num,
                        3: nt_dt,
                        4: nt_ty,
                        5: safe_pos(pos, outlet.gstin),
                        6: round(Decimal(str(val)), 2) if val is not None else Decimal('0.00'),
                        7: "", # Applicable % of Tax Rate
                        8: formatted_rate,
                        9: round(txval, 2),
                        10: round(cess, 2) if cess else "" # Cess
                    })
            if rows:
                data_map['cdnur'] = [
                    {"start_row": 5, "rows": rows}
                ]

        # Map HSN(B2B) and HSN(B2C) via Aggregation
        from apps.reports.models import GSTTransactionSnapshot
        hsn_agg = {}
        
        # Query all outward supplies (sales and sales returns/credit notes) for the period
        snap_query = GSTTransactionSnapshot.objects.filter(
            outlet=outlet, 
            transaction_type__in=['sale', 'sales_return', 'sales_credit_note']
        )
        if fp:
            snap_query = snap_query.filter(period=fp)
        if start_date and end_date:
            snap_query = snap_query.filter(document_date__gte=start_date, document_date__lte=end_date)
        snapshots = snap_query
        
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
            
            for composite_key, item in snap_json.get('hsn_summary', {}).items():
                hsn_sc = item.get('hsn_code', composite_key.split('_')[0]) if item.get('hsn_code', composite_key.split('_')[0]) else '0000'
                if not hsn_sc:
                    hsn_sc = "0000"
                    
                rt = float(item.get('rate', 0.0))
                uqc = item.get('uqc', 'PAC')
                
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
                
                # Extract and multiply values without rounding to avoid penny mismatch
                qty = Decimal(str(item.get('qty', 0))) * multiplier
                txval = Decimal(str(item.get('taxable_amount', 0))) * multiplier
                iamt = Decimal(str(item.get('igst', 0))) * multiplier
                camt = Decimal(str(item.get('cgst', 0))) * multiplier
                samt = Decimal(str(item.get('sgst', 0))) * multiplier
                csamt = Decimal(str(item.get('cess', 0))) * multiplier
                
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
                unique_hsn = set()
                tot_val = Decimal("0.00")
                tot_txval = Decimal("0.00")
                tot_iamt = Decimal("0.00")
                tot_camt = Decimal("0.00")
                tot_samt = Decimal("0.00")
                tot_csamt = Decimal("0.00")
            
                # Explicitly sort ascending by GST Rate key, then HSN code
                sheet_items = [
                    (k, v) for k, v in hsn_agg.items() if k[0] == sheet_name
                ]
                sorted_sheet_items = sorted(
                    sheet_items,
                    key=lambda x: (
                        Decimal(str(x[1]['rt'])),
                        str(x[1]['hsn_sc'])
                    )
                )

                for (s_key, hsn_sc, uqc, rt), data in sorted_sheet_items:
                    # Only output rows with non-zero quantity or value to avoid empty lines from perfectly cancelled returns
                    if data['qty'] != 0 or data['val'] != 0:
                        unique_hsn.add(data['hsn_sc'])
                        tot_val += data['val']
                        tot_txval += data['txval']
                        tot_iamt += data['iamt']
                        tot_camt += data['camt']
                        tot_samt += data['samt']
                        tot_csamt += data['csamt']
                        
                        formatted_rate = Decimal(str(data['rt'])).quantize(Decimal('0.01'))
                        rows.append({
                            1: data['hsn_sc'],
                            2: data['desc'],
                            3: data['uqc'],
                            4: round(data['qty'], 2),
                            5: round(data['val'], 2),
                            6: formatted_rate,
                            7: round(data['txval'], 2),
                            8: round(data['iamt'], 2),
                            9: round(data['camt'], 2),
                            10: round(data['samt'], 2),
                            11: round(data['csamt'], 2)
                        })
                        
                if rows:
                    data_map[sheet_name] = [
                        {"start_row": 3, "rows": [{
                            1: len(unique_hsn),
                            5: round(tot_val, 2),
                            7: round(tot_txval, 2),
                            8: round(tot_iamt, 2),
                            9: round(tot_camt, 2),
                            10: round(tot_samt, 2),
                            11: round(tot_csamt, 2)
                        }]},
                        {"start_row": 5, "rows": rows}
                    ]

        # Map Table 13 (docs): Summary of documents issued during the tax period
        if 'docs' in sheet_meta:
            from apps.billing.models import SaleInvoice, SalesReturn
            
            doc_rows = []
            total_docs_count = 0
            total_cancelled_count = 0
            
            # 1. Invoices for outward supply
            inv_filter = {'outlet': outlet, 'is_return': False}
            if start_date:
                inv_filter['invoice_date__gte'] = f"{start_date} 00:00:00" if len(str(start_date)) <= 10 else str(start_date)
            if end_date:
                inv_filter['invoice_date__lte'] = f"{end_date} 23:59:59" if len(str(end_date)) <= 10 else str(end_date)
                
            inv_qs = SaleInvoice.objects.filter(**inv_filter).order_by('invoice_date', 'invoice_no')
            inv_count = inv_qs.count()
            if inv_count > 0:
                first_inv = inv_qs.first().invoice_no
                last_inv = inv_qs.last().invoice_no
                cancelled_inv = inv_qs.filter(is_cancelled=True).count()
                
                doc_rows.append({
                    1: 'Invoices for outward supply',
                    2: first_inv,
                    3: last_inv,
                    4: inv_count,
                    5: cancelled_inv
                })
                total_docs_count += inv_count
                total_cancelled_count += cancelled_inv
            else:
                # Fallback to GSTTransactionSnapshot if direct SaleInvoice count is 0
                snap_filter = {'outlet': outlet, 'transaction_type': 'sale'}
                if start_date:
                    snap_filter['document_date__gte'] = str(start_date)[:10]
                if end_date:
                    snap_filter['document_date__lte'] = str(end_date)[:10]
                elif fp:
                    snap_filter['period'] = fp
                snap_qs = GSTTransactionSnapshot.objects.filter(**snap_filter).order_by('document_date', 'document_number')
                snap_count = snap_qs.count()
                if snap_count > 0:
                    first_inv = snap_qs.first().document_number
                    last_inv = snap_qs.last().document_number
                    doc_rows.append({
                        1: 'Invoices for outward supply',
                        2: first_inv,
                        3: last_inv,
                        4: snap_count,
                        5: 0
                    })
                    total_docs_count += snap_count
                
            # 2. Credit Notes (Sales Returns)
            ret_filter = {'outlet': outlet}
            if start_date:
                ret_filter['return_date__gte'] = str(start_date)[:10]
            if end_date:
                ret_filter['return_date__lte'] = str(end_date)[:10]
                
            ret_qs = SalesReturn.objects.filter(**ret_filter).order_by('return_date', 'return_no')
            ret_count = ret_qs.count()
            if ret_count > 0:
                first_ret = ret_qs.first().return_no
                last_ret = ret_qs.last().return_no
                cancelled_ret = ret_qs.filter(is_cancelled=True).count() if hasattr(SalesReturn, 'is_cancelled') else 0
                
                doc_rows.append({
                    1: 'Credit Note',
                    2: first_ret,
                    3: last_ret,
                    4: ret_count,
                    5: cancelled_ret
                })
                total_docs_count += ret_count
                total_cancelled_count += cancelled_ret
                
            if doc_rows:
                data_map['docs'] = [
                    {"start_row": 3, "rows": [{4: total_docs_count, 5: total_cancelled_count}]},
                    {"start_row": 5, "rows": doc_rows}
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
