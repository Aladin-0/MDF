import os
import io
import json
import hashlib
from datetime import datetime
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from apps.core.models import Outlet
from apps.reports.models import GSTExportAudit, ITCReconciliationRun, ITCReconciliationResult, DeferredITCEntry
from apps.reports.gstr_builders import GSTR1Builder, GSTR3BBuilder

class CAWorkingPaperPDFExportView(APIView):
    # Requires authentication and permission
    permission_classes = [IsAuthenticated]

    def get_current_outlet(self, request):
        return getattr(request.user, 'outlet', None)

    def get(self, request, fp):
        outlet = self.get_current_outlet(request)
        if not outlet:
            raise NotFound(detail="No outlet found")
            
        is_admin_or_super = getattr(request.user, 'role', '') in ('admin', 'super_admin')
        can_export = getattr(request.user, 'can_export_gst', False)
        if not (is_admin_or_super or can_export):
            raise PermissionDenied(detail="Missing GST export permission")

        # 1. GSTR-1 Builder (for Liability and Validation Issues)
        b1 = GSTR1Builder(outlet.gstin, fp)
        payload_1 = b1.generate_json()
        meta_1 = payload_1.get('_metadata', {})
        blocking_errors = meta_1.get('blocking_errors', [])
        warnings = meta_1.get('validation_warnings', [])
        
        if blocking_errors:
            return JsonResponse({"error": "Export blocked by validation errors", "details": blocking_errors}, status=422)

        # 2. GSTR-3B Builder (for ITC Summary)
        b3b = GSTR3BBuilder(outlet.gstin, fp)
        payload_3b = b3b.generate_json()
        
        # 3. Recon Status
        recon_run = ITCReconciliationRun.objects.filter(outlet=outlet, period=fp).last()
        matched_count = 0
        mismatched_count = 0
        missing_in_2b_count = 0
        deferred_count = 0
        if recon_run:
            results = ITCReconciliationResult.objects.filter(run=recon_run)
            matched_count = results.filter(match_status='MATCHED').count()
            mismatched_count = results.filter(match_status='MISMATCHED').count()
            missing_in_2b_count = results.filter(match_status='MISSING_IN_2B').count()
        deferred_count = DeferredITCEntry.objects.filter(purchase_invoice__outlet=outlet, original_period=fp).count()

        # Build PDF
        out_stream = io.BytesIO()
        doc = SimpleDocTemplate(out_stream, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        styles = getSampleStyleSheet()
        elements = []
        
        # Create initial audit log to get ID
        timestamp = datetime.now()
        source_json_hash = hashlib.sha256(json.dumps(payload_3b, sort_keys=True).encode()).hexdigest()
        audit = GSTExportAudit.objects.create(
            actor=request.user if request.user.is_authenticated else None,
            outlet=outlet,
            period=fp,
            export_type='WORKING_PAPER_PDF',
            source_json_hash=source_json_hash,
            output_file_hash='', # Will update after build
            validation_state={"warnings": warnings, "blocking": blocking_errors}
        )

        # Title and Headers
        title_style = styles['Heading1']
        title_style.alignment = 1 # Center
        elements.append(Paragraph("CA Working Paper - GST Returns", title_style))
        
        if blocking_errors:
            draft_style = ParagraphStyle('DraftStyle', parent=styles['Heading2'], textColor=colors.red, alignment=1)
            elements.append(Paragraph("DRAFT — BLOCKED FOR FILING", draft_style))
            
        elements.append(Spacer(1, 12))
        
        header_text = f"<b>Legal Entity:</b> {outlet.name}<br/><b>GSTIN:</b> {outlet.gstin}<br/><b>Filing Period:</b> {fp}<br/><b>Export ID:</b> {audit.id}"
        elements.append(Paragraph(header_text, styles['Normal']))
        elements.append(Spacer(1, 20))
        
        # Section 1: Liability (From GSTR-3B table 3.1)
        elements.append(Paragraph("Section 1: GSTR-3B Liability Summary", styles['Heading2']))
        sup_details = payload_3b.get('sup_details', {})
        osup_det = sup_details.get('osup_det', {}) # Outward Taxable
        
        data_liability = [
            ['Description', 'Taxable Value', 'IGST', 'CGST', 'SGST', 'Cess'],
            [
                'Outward Taxable Supplies', 
                str(osup_det.get('txval', 0)), 
                str(osup_det.get('iamt', 0)), 
                str(osup_det.get('camt', 0)), 
                str(osup_det.get('samt', 0)), 
                str(osup_det.get('csamt', 0))
            ]
        ]
        
        t_liab = Table(data_liability, colWidths=[180, 70, 70, 70, 70, 70])
        t_liab.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.grey),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black),
        ]))
        elements.append(t_liab)
        elements.append(Spacer(1, 20))

        # Section 2: Table 4 ITC Summary
        elements.append(Paragraph("Section 2: Table 4 ITC Summary", styles['Heading2']))
        itc_elg = payload_3b.get('itc_elg', {})
        itc_avl = itc_elg.get('itc_avl', [])
        
        all_other_itc = {'iamt': 0, 'camt': 0, 'samt': 0, 'csamt': 0}
        for avl in itc_avl:
            if avl.get('ty') == 'All other ITC':
                all_other_itc = avl
                
        data_itc = [
            ['Description', 'IGST', 'CGST', 'SGST', 'Cess'],
            [
                'All Other ITC', 
                str(all_other_itc.get('iamt', 0)), 
                str(all_other_itc.get('camt', 0)), 
                str(all_other_itc.get('samt', 0)), 
                str(all_other_itc.get('csamt', 0))
            ]
        ]
        t_itc = Table(data_itc, colWidths=[250, 70, 70, 70, 70])
        t_itc.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.grey),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 1, colors.black),
        ]))
        elements.append(t_itc)
        elements.append(Spacer(1, 20))

        # Section 3: Recon Status
        elements.append(Paragraph("Section 3: GSTR-2B Reconciliation Status", styles['Heading2']))
        data_recon = [
            ['Status', 'Count'],
            ['Matched', str(matched_count)],
            ['Mismatched', str(mismatched_count)],
            ['Missing in 2B', str(missing_in_2b_count)],
            ['Deferred', str(deferred_count)],
        ]
        t_recon = Table(data_recon, colWidths=[200, 100])
        t_recon.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.grey),
            ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
            ('GRID', (0,0), (-1,-1), 1, colors.black),
        ]))
        elements.append(t_recon)
        elements.append(Spacer(1, 20))

        # Section 4: Validation Issues
        elements.append(Paragraph("Section 4: Validation Issues (Warnings)", styles['Heading2']))
        if warnings:
            for w in warnings:
                elements.append(Paragraph(f"- {w}", styles['Normal']))
        else:
            elements.append(Paragraph("No warnings found.", styles['Normal']))
        
        elements.append(Spacer(1, 40))
        
        # Footer Disclaimer
        footer_style = ParagraphStyle('FooterStyle', parent=styles['Normal'], fontSize=8, textColor=colors.darkred)
        disclaimer = "DISCLAIMER: Indicative cash payable is subject to actual ledger balances and late fees. Not valid for direct filing.<br/>Cash payable is indicative until CA confirms tax-credit utilisation order."
        elements.append(Paragraph(disclaimer, footer_style))

        # Build document
        doc.build(elements)
        out_bytes = out_stream.getvalue()
        
        # Update Audit Log with file hash
        output_file_hash = hashlib.sha256(out_bytes).hexdigest()
        audit.output_file_hash = output_file_hash
        audit.save(update_fields=['output_file_hash'])
        
        response = HttpResponse(out_bytes, content_type='application/pdf')
        filename = f"GST_Working_Paper_{outlet.gstin}_{fp}_{timestamp.strftime('%Y%m%d%H%M%S')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        
        return response
