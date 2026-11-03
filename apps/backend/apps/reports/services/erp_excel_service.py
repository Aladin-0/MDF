import logging
from typing import Dict, Any, Optional, List
import openpyxl
from openpyxl.workbook import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

from apps.core.models import Outlet

logger = logging.getLogger(__name__)


class ErpExcelService:
    """
    Dedicated Excel export service for classic Marg ERP-style reporting.
    Transforms dictionary outputs from ErpReportService into professional, formatted .xlsx spreadsheets.
    """

    # ── Color & Styling Palette ──────────────────────────────────────────────────
    DARK_BLUE_HEX = "1F4E79"       # Marg ERP corporate dark blue
    HEADER_FILL = PatternFill(start_color=DARK_BLUE_HEX, end_color=DARK_BLUE_HEX, fill_type="solid")
    HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    
    TITLE_FONT = Font(name="Calibri", size=15, bold=True, color=DARK_BLUE_HEX)
    SUBTITLE_FONT = Font(name="Calibri", size=10, bold=False, color="333333")
    META_FONT = Font(name="Calibri", size=10, bold=True, color="1F4E79")
    
    BOLD_FONT = Font(name="Calibri", size=10, bold=True, color="000000")
    REGULAR_FONT = Font(name="Calibri", size=10, bold=False, color="000000")
    RETURN_FONT = Font(name="Calibri", size=10, bold=False, color="C00000")   # Red for credit notes
    
    SUMMARY_FILL = PatternFill(start_color="D9E1F2", end_color="D9E1F2", fill_type="solid")
    RETURN_FILL = PatternFill(start_color="FFF2F2", end_color="FFF2F2", fill_type="solid")
    
    # Borders
    THIN_BORDER = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )
    HEADER_BORDER = Border(
        left=Side(style='thin', color='FFFFFF'),
        right=Side(style='thin', color='FFFFFF'),
        top=Side(style='medium', color='1F4E79'),
        bottom=Side(style='medium', color='1F4E79')
    )
    SUMMARY_BORDER = Border(
        left=Side(style='thin', color='B0C4DE'),
        right=Side(style='thin', color='B0C4DE'),
        top=Side(style='thin', color='1F4E79'),
        bottom=Side(style='double', color='1F4E79')
    )

    # Alignments
    CENTER_ALIGN = Alignment(horizontal="center", vertical="center")
    LEFT_ALIGN = Alignment(horizontal="left", vertical="center")
    RIGHT_ALIGN = Alignment(horizontal="right", vertical="center")
    HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Number formats
    CURRENCY_FORMAT = '#,##0.00'
    PERCENT_FORMAT = '0.00"%"'
    INTEGER_FORMAT = '#,##0'

    @classmethod
    def _resolve_outlet(cls, outlet: Any) -> Optional[Outlet]:
        if isinstance(outlet, Outlet):
            return outlet
        if isinstance(outlet, str) and outlet.strip():
            return Outlet.objects.filter(id=outlet).first()
        return None

    @classmethod
    def _write_pharmacy_header(
        cls,
        ws,
        outlet_obj: Any,
        report_title: str,
        format_mode: str,
        date_range: Dict[str, str],
        num_cols: int
    ) -> None:
        """
        Creates the classic Marg ERP 3-row header:
        - Row 1: Pharmacy Name
        - Row 2: Address / Phone / GSTIN
        - Row 3: DL No / Report Title / Date Range
        - Row 4: Empty separator
        - Row 5 will be the table header
        """
        outlet = cls._resolve_outlet(outlet_obj)
        
        name = getattr(outlet, 'name', 'MediFlow Pharmacy') if outlet else 'MediFlow Pharmacy'
        address = getattr(outlet, 'address', '') if outlet else ''
        city = getattr(outlet, 'city', '') if outlet else ''
        state = getattr(outlet, 'state', '') if outlet else ''
        pincode = getattr(outlet, 'pincode', '') if outlet else ''
        phone = getattr(outlet, 'phone', '') if outlet else ''
        gstin = getattr(outlet, 'gstin', '') if outlet else ''
        dl_no = getattr(outlet, 'drug_license_no', '') if outlet else ''

        # Construct Row 2 Text (Address & Contact)
        addr_parts = [p for p in [address, city, f"{state} {pincode}".strip()] if p]
        addr_line = ", ".join(addr_parts)
        contact_items = []
        if addr_line:
            contact_items.append(addr_line)
        if phone:
            contact_items.append(f"Phone: {phone}")
        if gstin:
            contact_items.append(f"GSTIN: {gstin}")
        row2_text = "  |  ".join(contact_items) if contact_items else "Pharmacy Retail & Wholesale Division"

        # Construct Row 3 Text (DL No & Report Metadata)
        start_d = date_range.get('start_date', '')
        end_d = date_range.get('end_date', '')
        row3_items = []
        if dl_no:
            row3_items.append(f"DL No: {dl_no}")
        row3_items.append(f"{report_title} ({format_mode.title()})")
        if start_d and end_d:
            row3_items.append(f"Period: {start_d} to {end_d}")
        row3_text = "  |  ".join(row3_items)

        # Merge and set Row 1
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=num_cols)
        c1 = ws.cell(row=1, column=1, value=name.upper())
        c1.font = cls.TITLE_FONT
        c1.alignment = cls.CENTER_ALIGN
        ws.row_dimensions[1].height = 24

        # Merge and set Row 2
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=num_cols)
        c2 = ws.cell(row=2, column=1, value=row2_text)
        c2.font = cls.SUBTITLE_FONT
        c2.alignment = cls.CENTER_ALIGN
        ws.row_dimensions[2].height = 18

        # Merge and set Row 3
        ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=num_cols)
        c3 = ws.cell(row=3, column=1, value=row3_text)
        c3.font = cls.META_FONT
        c3.alignment = cls.CENTER_ALIGN
        ws.row_dimensions[3].height = 18

        # Row 4 is an empty separator
        ws.row_dimensions[4].height = 8

    @classmethod
    def _autofit_columns(cls, ws, min_widths: Optional[Dict[str, int]] = None) -> None:
        """
        Adjusts column widths based on content while respecting minimum thresholds.
        Ignores rows 1 to 4 (title banner) to prevent artificially stretched columns.
        """
        min_widths = min_widths or {}
        for col in ws.columns:
            col_letter = get_column_letter(col[0].column)
            max_len = 0
            for cell in col[4:]:  # row 5 and below
                val_str = str(cell.value or '')
                if len(val_str) > max_len:
                    max_len = len(val_str)
            target_min = min_widths.get(col_letter, 12)
            ws.column_dimensions[col_letter].width = max(max_len + 4, target_min)

    @classmethod
    def generate_sales_book_excel(cls, report_data: Dict[str, Any], outlet: Any) -> Workbook:
        """
        Generates Marg ERP-style Consolidated Sales Book Excel spreadsheet.
        Handles Detailed (bill-by-bill with GST slabs) and Summarised (day-wise) modes.
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        
        is_summarised = report_data.get('format') == 'summarised'
        date_range = report_data.get('date_range', {})
        rows = report_data.get('rows', [])
        summary = report_data.get('summary', {})
        
        ws.title = "Sales Book Summarised" if is_summarised else "Sales Book Detailed"
        ws.views.sheetView[0].showGridLines = True

        if is_summarised:
            headers = [
                "Date", "Bill Count", "Taxable", "5% Tax", "12% Tax", "18% Tax",
                "28% Tax", "Total GST", "Exempted", "Round Off", "Net Total"
            ]
        else:
            headers = [
                "Date", "Bill No", "Party Name", "GSTIN", "Taxable", "5% Tax",
                "12% Tax", "18% Tax", "28% Tax", "Total GST", "Exempted",
                "Round Off", "Net Total"
            ]

        num_cols = len(headers)

        # 1. 3-Row Pharmacy Header
        cls._write_pharmacy_header(
            ws=ws,
            outlet_obj=outlet,
            report_title="CONSOLIDATED SALES BOOK",
            format_mode="summarised" if is_summarised else "detailed",
            date_range=date_range,
            num_cols=num_cols
        )

        # 2. Row 5: Column Headers (Dark Blue background, White bold text)
        ws.row_dimensions[5].height = 26
        for col_idx, header_text in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=col_idx, value=header_text)
            cell.font = cls.HEADER_FONT
            cell.fill = cls.HEADER_FILL
            cell.alignment = cls.HEADER_ALIGN
            cell.border = cls.HEADER_BORDER

        # Freeze panes at A6 so headers stay visible
        ws.freeze_panes = 'A6'

        # 3. Data Rows
        current_row = 6
        for r in rows:
            is_return = r.get('is_return', False)
            row_font = cls.RETURN_FONT if is_return else cls.REGULAR_FONT
            row_fill = cls.RETURN_FILL if is_return else None

            if is_summarised:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('bill_count', 0), cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                    (r.get('taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('net_total', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                ]
            else:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('bill_no', ''), cls.CENTER_ALIGN, None),
                    (r.get('party_name', ''), cls.LEFT_ALIGN, None),
                    (r.get('gstin', ''), cls.CENTER_ALIGN, None),
                    (r.get('taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('net_total', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                ]

            ws.row_dimensions[current_row].height = 20
            for col_idx, (val, align, num_fmt) in enumerate(row_vals, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = row_font
                cell.alignment = align
                cell.border = cls.THIN_BORDER
                if row_fill:
                    cell.fill = row_fill
                if num_fmt:
                    cell.number_format = num_fmt

            current_row += 1

        # 4. Summary Row (Totals)
        ws.row_dimensions[current_row].height = 22
        if is_summarised:
            total_bills = summary.get('invoice_count', sum(r.get('bill_count', 0) for r in rows))
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (total_bills, cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                (summary.get('total_taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_net_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            ]
        else:
            inv_count = summary.get('invoice_count', len(rows))
            ret_count = summary.get('return_count', 0)
            ret_desc = f"{ret_count} Returns" if ret_count > 0 else ""
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (f"{inv_count} Bills", cls.CENTER_ALIGN, None),
                (ret_desc, cls.LEFT_ALIGN, None),
                ("", cls.CENTER_ALIGN, None),
                (summary.get('total_taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_net_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            ]

        for col_idx, (val, align, num_fmt) in enumerate(summary_vals, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = cls.BOLD_FONT
            cell.fill = cls.SUMMARY_FILL
            cell.alignment = align
            cell.border = cls.SUMMARY_BORDER
            if num_fmt:
                cell.number_format = num_fmt

        # 5. Column Widths
        custom_widths = {
            'A': 14,  # Date
            'B': 16 if not is_summarised else 14,  # Bill No / Bill Count
            'C': 30 if not is_summarised else 15,  # Party Name / Taxable
            'D': 18 if not is_summarised else 14,  # GSTIN / 5% Tax
            'E': 15,  # Taxable / 12%
            'F': 14,  # 5% Tax / 18%
            'G': 14,  # 12% Tax / 28%
            'H': 14,  # 18% Tax / Total GST
            'I': 14,  # 28% Tax / Exempted
            'J': 15,  # Total GST / Round Off
            'K': 15,  # Exempted / Net Total
            'L': 14,  # Round Off
            'M': 16,  # Net Total
        }
        cls._autofit_columns(ws, custom_widths)

        return wb

    @classmethod
    def generate_gross_loss_on_return_excel(
        cls, report_data: Dict[str, Any], outlet: Any
    ) -> Workbook:
        """Export gross loss on sales returns in detailed or daily form."""
        wb = openpyxl.Workbook()
        ws = wb.active

        is_summarised = report_data.get('format') == 'summarised'
        format_mode = 'summarised' if is_summarised else 'detailed'
        date_range = report_data.get('date_range', {})
        rows = report_data.get('rows', [])
        summary = report_data.get('summary', {})

        ws.title = f"Gross Loss Return {format_mode.title()}"
        ws.views.sheetView[0].showGridLines = True
        headers = (
            ["Date", "Return Count", "Return Amount", "Cost", "Gross Loss", "Loss %"]
            if is_summarised else
            ["Date", "Return No", "Party Name", "Return Amount", "Cost", "Gross Loss", "Loss %"]
        )

        cls._write_pharmacy_header(
            ws, outlet, "GROSS LOSS ON SALES RETURN", format_mode, date_range, len(headers)
        )
        ws.row_dimensions[5].height = 26
        for col_idx, label in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=col_idx, value=label)
            cell.font = cls.HEADER_FONT
            cell.fill = cls.HEADER_FILL
            cell.alignment = cls.HEADER_ALIGN
            cell.border = cls.HEADER_BORDER
        ws.freeze_panes = 'A6'

        current_row = 6
        for row in rows:
            values = [
                (row.get('date', ''), cls.CENTER_ALIGN, None),
            ]
            if is_summarised:
                values.append((row.get('return_count', 0), cls.CENTER_ALIGN, cls.INTEGER_FORMAT))
            else:
                values.extend([
                    (row.get('return_no', ''), cls.CENTER_ALIGN, None),
                    (row.get('party_name', ''), cls.LEFT_ALIGN, None),
                ])
            values.extend([
                (row.get('return_amount', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (row.get('cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (row.get('gross_loss', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (row.get('loss_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
            ])

            ws.row_dimensions[current_row].height = 20
            for col_idx, (value, alignment, number_format) in enumerate(values, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=value)
                cell.font = cls.RETURN_FONT
                cell.fill = cls.RETURN_FILL
                cell.alignment = alignment
                cell.border = cls.THIN_BORDER
                if number_format:
                    cell.number_format = number_format
            current_row += 1

        summary_values = [('TOTAL', cls.CENTER_ALIGN, None)]
        if is_summarised:
            summary_values.append((summary.get('return_count', 0), cls.CENTER_ALIGN, cls.INTEGER_FORMAT))
        else:
            summary_values.extend([
                (f"{summary.get('return_count', 0)} Returns", cls.CENTER_ALIGN, None),
                ('', cls.LEFT_ALIGN, None),
            ])
        summary_values.extend([
            (summary.get('total_return_amount', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            (summary.get('total_cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            (summary.get('total_gross_loss', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            (summary.get('loss_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
        ])
        ws.row_dimensions[current_row].height = 22
        for col_idx, (value, alignment, number_format) in enumerate(summary_values, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=value)
            cell.font = cls.BOLD_FONT
            cell.fill = cls.SUMMARY_FILL
            cell.alignment = alignment
            cell.border = cls.SUMMARY_BORDER
            if number_format:
                cell.number_format = number_format

        cls._autofit_columns(ws, {
            'A': 14,
            'B': 17 if not is_summarised else 16,
            'C': 30 if not is_summarised else 18,
            'D': 18,
            'E': 18,
            'F': 18,
            'G': 14,
        })
        return wb

    @classmethod
    def generate_gross_profit_excel(cls, report_data: Dict[str, Any], outlet: Any) -> Workbook:
        """
        Generates Marg ERP-style Gross Profit Report Excel spreadsheet.
        Handles Detailed (bill-by-bill with COGS & margin %) and Summarised (day-wise) modes.
        """
        wb = openpyxl.Workbook()
        ws = wb.active

        is_summarised = report_data.get('format') == 'summarised'
        date_range = report_data.get('date_range', {})
        rows = report_data.get('rows', [])
        summary = report_data.get('summary', {})

        ws.title = "Gross Profit Summarised" if is_summarised else "Gross Profit Detailed"
        ws.views.sheetView[0].showGridLines = True

        if is_summarised:
            headers = ["Date", "Bill Count", "Net Sales", "Cost", "Gross Profit", "Profit %"]
        else:
            headers = ["Date", "Bill No", "Party Name", "Net Sales", "Cost", "Gross Profit", "Profit %"]

        num_cols = len(headers)

        # 1. 3-Row Pharmacy Header
        cls._write_pharmacy_header(
            ws=ws,
            outlet_obj=outlet,
            report_title="GROSS PROFIT REPORT",
            format_mode="summarised" if is_summarised else "detailed",
            date_range=date_range,
            num_cols=num_cols
        )

        # 2. Row 5: Column Headers (Dark Blue background, White bold text)
        ws.row_dimensions[5].height = 26
        for col_idx, header_text in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=col_idx, value=header_text)
            cell.font = cls.HEADER_FONT
            cell.fill = cls.HEADER_FILL
            cell.alignment = cls.HEADER_ALIGN
            cell.border = cls.HEADER_BORDER

        # Freeze panes at A6 so headers stay visible
        ws.freeze_panes = 'A6'

        # 3. Data Rows
        current_row = 6
        for r in rows:
            is_return = r.get('is_return', False)
            row_font = cls.RETURN_FONT if is_return else cls.REGULAR_FONT
            row_fill = cls.RETURN_FILL if is_return else None

            if is_summarised:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('bill_count', 0), cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                    (r.get('net_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('gross_profit', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('profit_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
                ]
            else:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('bill_no', ''), cls.CENTER_ALIGN, None),
                    (r.get('party_name', ''), cls.LEFT_ALIGN, None),
                    (r.get('net_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('gross_profit', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('profit_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
                ]

            ws.row_dimensions[current_row].height = 20
            for col_idx, (val, align, num_fmt) in enumerate(row_vals, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = row_font
                cell.alignment = align
                cell.border = cls.THIN_BORDER
                if row_fill:
                    cell.fill = row_fill
                if num_fmt:
                    cell.number_format = num_fmt

            current_row += 1

        # 4. Summary Row (Totals)
        ws.row_dimensions[current_row].height = 22
        if is_summarised:
            total_bills = summary.get('invoice_count', sum(r.get('bill_count', 0) for r in rows))
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (total_bills, cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                (summary.get('total_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gross_profit', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('profit_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
            ]
        else:
            inv_count = summary.get('invoice_count', len(rows))
            ret_count = summary.get('return_count', 0)
            ret_desc = f"{ret_count} Returns" if ret_count > 0 else ""
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (f"{inv_count} Bills", cls.CENTER_ALIGN, None),
                (ret_desc, cls.LEFT_ALIGN, None),
                (summary.get('total_sales', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_cogs', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gross_profit', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('profit_pct', 0.0), cls.RIGHT_ALIGN, cls.PERCENT_FORMAT),
            ]

        for col_idx, (val, align, num_fmt) in enumerate(summary_vals, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = cls.BOLD_FONT
            cell.fill = cls.SUMMARY_FILL
            cell.alignment = align
            cell.border = cls.SUMMARY_BORDER
            if num_fmt:
                cell.number_format = num_fmt

        # 5. Column Widths
        custom_widths = {
            'A': 14,  # Date
            'B': 16 if not is_summarised else 14,  # Bill No / Bill Count
            'C': 32 if not is_summarised else 16,  # Party Name / Net Sales
            'D': 16,  # Net Sales / Cost
            'E': 16,  # Cost / Gross Profit
            'F': 16,  # Gross Profit / Profit %
            'G': 14,  # Profit %
        }
        cls._autofit_columns(ws, custom_widths)

        return wb

    @classmethod
    def generate_sales_return_book_excel(cls, report_data: Dict[str, Any], outlet: Any) -> Workbook:
        """
        Generates Marg ERP-style Sales Return Book (Credit Notes) Excel spreadsheet.
        Handles Detailed (return-by-return with GST slabs) and Summarised (day-wise) modes.
        Applies RETURN_FONT (red text) and RETURN_FILL (light red) to data rows to
        visually emphasize that these are refunded transactions.
        """
        wb = openpyxl.Workbook()
        ws = wb.active

        is_summarised = report_data.get('format') == 'summarised'
        date_range = report_data.get('date_range', {})
        rows = report_data.get('rows', [])
        summary = report_data.get('summary', {})

        ws.title = "Return Book Summarised" if is_summarised else "Return Book Detailed"
        ws.views.sheetView[0].showGridLines = True

        if is_summarised:
            headers = [
                "Date", "Return Count", "Taxable", "5% Tax", "12% Tax", "18% Tax",
                "28% Tax", "Total GST", "Exempted", "Round Off", "Net Total"
            ]
        else:
            headers = [
                "Date", "Bill No (Return No)", "Party Name", "GSTIN", "Taxable", "5% Tax",
                "12% Tax", "18% Tax", "28% Tax", "Total GST", "Exempted",
                "Round Off", "Net Total"
            ]

        num_cols = len(headers)

        # 1. 3-Row Pharmacy Header
        cls._write_pharmacy_header(
            ws=ws,
            outlet_obj=outlet,
            report_title="SALES RETURN BOOK (CREDIT NOTES)",
            format_mode="summarised" if is_summarised else "detailed",
            date_range=date_range,
            num_cols=num_cols
        )

        # 2. Row 5: Column Headers (Dark Blue background, White bold text)
        ws.row_dimensions[5].height = 26
        for col_idx, header_text in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=col_idx, value=header_text)
            cell.font = cls.HEADER_FONT
            cell.fill = cls.HEADER_FILL
            cell.alignment = cls.HEADER_ALIGN
            cell.border = cls.HEADER_BORDER

        # Freeze panes at A6 so headers stay visible
        ws.freeze_panes = 'A6'

        # 3. Data Rows - Styled with RETURN_FONT (red text) to emphasize credit notes
        current_row = 6
        for r in rows:
            row_font = cls.RETURN_FONT
            row_fill = cls.RETURN_FILL

            if is_summarised:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('return_count', r.get('bill_count', 0)), cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                    (r.get('taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('net_total', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                ]
            else:
                row_vals = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('return_no', r.get('bill_no', '')), cls.CENTER_ALIGN, None),
                    (r.get('party_name', ''), cls.LEFT_ALIGN, None),
                    (r.get('gstin', ''), cls.CENTER_ALIGN, None),
                    (r.get('taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                    (r.get('net_total', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                ]

            ws.row_dimensions[current_row].height = 20
            for col_idx, (val, align, num_fmt) in enumerate(row_vals, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = row_font
                cell.alignment = align
                cell.border = cls.THIN_BORDER
                if row_fill:
                    cell.fill = row_fill
                if num_fmt:
                    cell.number_format = num_fmt

            current_row += 1

        # 4. Summary Row (Totals)
        ws.row_dimensions[current_row].height = 22
        if is_summarised:
            total_returns = summary.get('return_count', sum(r.get('return_count', r.get('bill_count', 0)) for r in rows))
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (total_returns, cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                (summary.get('total_taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_net_returns', summary.get('total_net_sales', 0.0)), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            ]
        else:
            ret_count = summary.get('return_count', len(rows))
            summary_vals = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (f"{ret_count} Returns", cls.CENTER_ALIGN, None),
                ("", cls.LEFT_ALIGN, None),
                ("", cls.CENTER_ALIGN, None),
                (summary.get('total_taxable', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_5', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_12', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_18', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_tax_28', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_gst', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_exempted', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_round_off', 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
                (summary.get('total_net_returns', summary.get('total_net_sales', 0.0)), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT),
            ]

        for col_idx, (val, align, num_fmt) in enumerate(summary_vals, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = cls.BOLD_FONT
            cell.fill = cls.SUMMARY_FILL
            cell.alignment = align
            cell.border = cls.SUMMARY_BORDER
            if num_fmt:
                cell.number_format = num_fmt

        # 5. Column Widths
        custom_widths = {
            'A': 14,  # Date
            'B': 22 if not is_summarised else 14,  # Bill No (Return No) / Return Count
            'C': 30 if not is_summarised else 15,  # Party Name / Taxable
            'D': 18 if not is_summarised else 14,  # GSTIN / 5% Tax
            'E': 15,  # Taxable / 12%
            'F': 14,  # 5% Tax / 18%
            'G': 14,  # 12% Tax / 28%
            'H': 14,  # 18% Tax / Total GST
            'I': 14,  # 28% Tax / Exempted
            'J': 15,  # Total GST / Round Off
            'K': 15,  # Exempted / Net Total
            'L': 14,  # Round Off
            'M': 16,  # Net Total
        }
        cls._autofit_columns(ws, custom_widths)

        return wb

    # ── Purchase registers (Marg ERP Purchase Book / Purchase Return Book) ───────

    @classmethod
    def _generate_purchase_register_excel(
        cls,
        report_data: Dict[str, Any],
        outlet: Any,
        report_title: str,
        sheet_title: str,
        count_label: str,
    ) -> Workbook:
        """
        Shared writer for the three Marg-style purchase registers.
        Detailed columns: DATE, BILL NO., PARTY NAME, BILL AMT., TAXABLE, TAX, TAX FREE, EXEMPTED, R.OFF
        Summarised columns: DATE, <count_label>, BILL AMT., TAXABLE, TAX, TAX FREE, EXEMPTED, R.OFF
        """
        wb = openpyxl.Workbook()
        ws = wb.active

        is_summarised = report_data.get('format') == 'summarised'
        rows = report_data.get('rows', [])
        summary = report_data.get('summary', {})
        date_range = report_data.get('date_range', {})

        ws.title = f"{sheet_title} {'Summarised' if is_summarised else 'Detailed'}"[:31]

        money_headers = ["BILL AMT.", "TAXABLE", "TAX", "TAX FREE", "EXEMPTED", "R.OFF"]
        if is_summarised:
            headers = ["DATE", count_label] + money_headers
        else:
            headers = ["DATE", "BILL NO.", "PARTY NAME"] + money_headers
        num_cols = len(headers)

        cls._write_pharmacy_header(
            ws=ws,
            outlet_obj=outlet,
            report_title=report_title,
            format_mode="summarised" if is_summarised else "detailed",
            date_range=date_range,
            num_cols=num_cols,
        )

        ws.row_dimensions[5].height = 26
        for col_idx, header_text in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=col_idx, value=header_text)
            cell.font = cls.HEADER_FONT
            cell.fill = cls.HEADER_FILL
            cell.alignment = cls.HEADER_ALIGN
            cell.border = cls.HEADER_BORDER
        ws.freeze_panes = 'A6'

        money_keys = ['bill_amt', 'taxable', 'tax', 'tax_free', 'exempted', 'round_off']
        current_row = 6
        for r in rows:
            is_return = r.get('is_return', False)
            row_font = cls.RETURN_FONT if is_return else cls.REGULAR_FONT
            row_fill = cls.RETURN_FILL if is_return else None

            if is_summarised:
                lead = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('return_count' if count_label == 'RETURNS' else 'bill_count', 0),
                     cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
                ]
            else:
                lead = [
                    (r.get('date', ''), cls.CENTER_ALIGN, None),
                    (r.get('bill_no', ''), cls.CENTER_ALIGN, None),
                    (r.get('party_name', ''), cls.LEFT_ALIGN, None),
                ]
            row_vals = lead + [(r.get(k, 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT) for k in money_keys]

            ws.row_dimensions[current_row].height = 20
            for col_idx, (val, align, num_fmt) in enumerate(row_vals, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = row_font
                cell.alignment = align
                cell.border = cls.THIN_BORDER
                if row_fill:
                    cell.fill = row_fill
                if num_fmt:
                    cell.number_format = num_fmt
            current_row += 1

        # Totals row ("Total : N" in the Marg export)
        ws.row_dimensions[current_row].height = 22
        if count_label == 'RETURNS':
            doc_count = summary.get('return_count', 0)
        else:
            doc_count = summary.get('bill_count', 0)
        if is_summarised:
            lead_total = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (doc_count, cls.CENTER_ALIGN, cls.INTEGER_FORMAT),
            ]
        else:
            lead_total = [
                ("TOTAL", cls.CENTER_ALIGN, None),
                (f"{doc_count}", cls.CENTER_ALIGN, None),
                ("", cls.LEFT_ALIGN, None),
            ]
        total_keys = ['total_bill_amt', 'total_taxable', 'total_tax', 'total_tax_free',
                      'total_exempted', 'total_round_off']
        total_vals = lead_total + [(summary.get(k, 0.0), cls.RIGHT_ALIGN, cls.CURRENCY_FORMAT) for k in total_keys]
        for col_idx, (val, align, num_fmt) in enumerate(total_vals, start=1):
            cell = ws.cell(row=current_row, column=col_idx, value=val)
            cell.font = cls.BOLD_FONT
            cell.fill = cls.SUMMARY_FILL
            cell.alignment = align
            cell.border = cls.SUMMARY_BORDER
            if num_fmt:
                cell.number_format = num_fmt

        if is_summarised:
            widths = {'A': 14, 'B': 12, 'C': 16, 'D': 16, 'E': 14, 'F': 14, 'G': 14, 'H': 14}
        else:
            widths = {'A': 14, 'B': 18, 'C': 38, 'D': 16, 'E': 16, 'F': 14, 'G': 14, 'H': 14, 'I': 14}
        cls._autofit_columns(ws, widths)
        return wb

    @classmethod
    def generate_purchase_book_excel(
        cls, report_data: Dict[str, Any], outlet: Any, consolidated: bool = False
    ) -> Workbook:
        """Purchase Book / Consolidated Purchase Book (Marg ERP layout)."""
        return cls._generate_purchase_register_excel(
            report_data,
            outlet,
            report_title="CONSOLIDATED PURCHASE BOOK" if consolidated else "PURCHASE BOOK",
            sheet_title="Consolidated Purchase Book" if consolidated else "Purchase Book",
            count_label="BILLS",
        )

    @classmethod
    def generate_purchase_return_book_excel(cls, report_data: Dict[str, Any], outlet: Any) -> Workbook:
        """Purchase Return Book - debit note register (Marg ERP layout)."""
        return cls._generate_purchase_register_excel(
            report_data,
            outlet,
            report_title="PURCHASE RETURN BOOK",
            sheet_title="Purchase Return Book",
            count_label="RETURNS",
        )

