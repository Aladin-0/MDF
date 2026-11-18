"""
One look for every Excel file the inventory screens produce (Stock Ledger, Expiry Manager, batch trace): a title block, a dark
header with filters, frozen header row, sensible widths, real dates and numbers (so Excel can sort and sum them), money with
thousands separators, and a landscape print setup that repeats the header. Plain `ws.append` rows with default widths were
unreadable (text cut off, dates as text, no filter).
"""
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

DATE = 'dd-mmm-yyyy'
MONEY = '#,##0.00'
PACKS = '#,##0.###'
SIGNED_PACKS = '+#,##0.###;-#,##0.###;0'
SIGNED_MONEY = '+#,##0.00;-#,##0.00;0.00'
INT = '#,##0'

_HEAD_FILL = PatternFill('solid', fgColor='1E293B')
_HEAD_FONT = Font(bold=True, color='FFFFFF')
_BAND = PatternFill('solid', fgColor='F8FAFC')
_THIN = Side(style='thin', color='E2E8F0')
RED = Font(color='B91C1C', bold=True)
MUTED = Font(color='64748B', italic=True)


def safe(v):
    """A cell that starts with = + - @ is read by Excel as a formula: a product named '=cmd' must stay text."""
    return "'" + v if isinstance(v, str) and v[:1] in ('=', '+', '-', '@') else v


def title_block(ws, title: str, *lines: str):
    """Rows 1-3: the title, then up to two grey lines (filters, who/when). The table's header is row 4."""
    ws['A1'] = safe(title)
    ws['A1'].font = Font(bold=True, size=14)
    for i, line in enumerate(lines[:2], start=2):
        ws.cell(row=i, column=1, value=safe(line)).font = MUTED


def header(ws, row: int, labels, widths=None, right=()):
    """A dark, wrapped header. `right` = 1-based columns whose header is right-aligned (numbers)."""
    for i, label in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=label)
        c.font, c.fill = _HEAD_FONT, _HEAD_FILL
        c.alignment = Alignment(vertical='center', wrap_text=True, horizontal='right' if i in right else 'left', indent=1 if i > 1 else 0)
    ws.row_dimensions[row].height = 28
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w


def style_cells(ws, first_row: int, last_row: int, formats: dict, right=(), wrap=()):
    """Number formats per 1-based column, right alignment for numbers, light row borders and a faint band on every other row."""
    for r in range(first_row, last_row + 1):
        for col in range(1, ws.max_column + 1):
            c = ws.cell(row=r, column=col)
            if col in formats:
                c.number_format = formats[col]
            # left AND right padding (indent): a number column next to a text column used to touch it ("25 strips + 10 tablets-0.333")
            c.alignment = Alignment(vertical='top', horizontal='right' if col in right else 'left', indent=1 if col > 1 else 0, wrap_text=col in wrap)
            c.border = Border(bottom=_THIN)
            if (r - first_row) % 2 == 1:
                c.fill = _BAND


def finish(ws, header_row: int, last_row: int, ncols: int, freeze_cols: int = 0, landscape: bool = True):
    """Frozen header (and the first columns), a filter on the header, and a print setup that fits the width and repeats the header."""
    ws.freeze_panes = ws.cell(row=header_row + 1, column=freeze_cols + 1)
    if last_row > header_row:
        ws.auto_filter.ref = f'A{header_row}:{get_column_letter(ncols)}{last_row}'
    ws.print_title_rows = f'{header_row}:{header_row}'
    ws.page_setup.orientation = 'landscape' if landscape else 'portrait'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.sheet_view.showGridLines = False


def total_row(ws, row: int, ncols: int):
    for col in range(1, ncols + 1):
        c = ws.cell(row=row, column=col)
        c.font = Font(bold=True)
        c.border = Border(top=Side(style='medium', color='1E293B'))
