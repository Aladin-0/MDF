"""Read Marg's exports into plain rows. Nothing here touches the database or decides anything."""
import io
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation


class MargFileError(Exception):
    """The file is not the Marg export this loader knows. Never guessed around."""


# Marg writes control characters as numeric entities (&#4;) and bare ampersands: neither is valid XML.
_CONTROL = re.compile(r'&#(?:0?[0-8]|1[12]|1[4-9]|2[0-9]|3[01]);')
_BARE_AMP = re.compile(r'&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)')


def clean_xml(text: str) -> str:
    return _BARE_AMP.sub('&amp;', _CONTROL.sub('', text))


@dataclass(frozen=True)
class MargItem:
    name: str
    company: str        # Marg's stock group: the brand / marketer
    unit: str           # BASEUNITS. "TAB" is Marg's default and says nothing about the item
    pack_text: str      # DENOMINATOR: free typing ("1*10TAB", "100S", "20ML")
    conversion: int     # units in one pack as Marg counts stock; 0 when Marg has none
    hsn: str
    gst: Decimal | None  # None when Marg has no rate for the item
    opening_qty: Decimal = Decimal('0')     # Marg's stock of the item on the first day of its books (1 April)
    opening_value: Decimal = Decimal('0')   # what Marg values that stock at: Marg's own "opening stock"
    opening_rate: Decimal = Decimal('0')


def _dec(text) -> Decimal | None:
    m = re.match(r'-?\d+(?:\.\d+)?', (text or '').strip().replace(',', ''))
    if not m:
        return None
    try:
        return Decimal(m.group(0))
    except InvalidOperation:
        return None


def parse_items(xml_text: str) -> list[MargItem]:
    items = []
    for _, el in ET.iterparse(io.StringIO(clean_xml(xml_text)), events=('end',)):
        if el.tag != 'STOCKITEM':
            continue
        name = (el.get('NAME') or '').strip()
        gst = None
        for rate in el.iter('RATEDETAILS.LIST'):
            if 'INTEGRATED' in (rate.findtext('GSTRATEDUTYHEAD') or '').upper():
                gst = _dec(rate.findtext('GSTRATE'))
        conv = _dec(el.findtext('CONVERSION'))
        hsn = ''
        for h in el.iter('HSNCODE'):
            hsn = (h.text or '').strip()
            break
        if name:
            items.append(MargItem(
                name=name,
                company=(el.findtext('PARENT') or '').strip(),
                unit=(el.findtext('BASEUNITS') or '').strip(),
                pack_text=(el.findtext('DENOMINATOR') or '').strip(),
                conversion=int(conv) if conv is not None and conv == conv.to_integral_value() and conv > 0 else 0,
                hsn=hsn,
                gst=gst,
                opening_qty=_dec(el.findtext('OPENINGBALANCE')) or Decimal('0'),
                opening_value=_dec(el.findtext('OPENINGVALUE')) or Decimal('0'),
                opening_rate=_dec(el.findtext('OPENINGRATE')) or Decimal('0'),
            ))
        el.clear()
    if not items:
        raise MargFileError('No stock items found: this is not a Marg "All Masters" export.')
    return items


def read_items(path) -> list[MargItem]:
    with open(path, 'r', encoding='latin-1') as fh:
        return parse_items(fh.read())


# ── the stock report ─────────────────────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class StockRow:
    line: int            # the row number in Excel (1-based), so the shop can find it
    code: str
    name: str
    unit: str
    stock: Decimal       # as Marg prints it: "packs.loose" when the item has a pack (rules.read_quantity)
    cost: Decimal        # "Cost Price": what a pack cost the shop
    value: Decimal
    mrp: Decimal
    purchase_price: Decimal
    company: str
    batch: str
    expiry: str
    supplier: str
    invoice_no: str
    rack: str
    sticker: str         # Marg's own sticker number for the batch (the "Barcode" column)


@dataclass
class StockSheet:
    company: str
    as_on: date
    rows: list = field(default_factory=list)
    total_value: Decimal | None = None   # the report's own grand total, to check the read against


# column -> the header Marg prints there. A report with other columns is refused, never read by position alone.
STOCK_COLUMNS = {
    0: 'Code', 1: 'Product Name', 2: 'Unit', 3: 'Current Stock', 8: 'Cost Price', 9: 'Value', 10: 'M.R.P.',
    11: 'Purchase Price', 13: 'Company', 16: 'Batch', 18: 'EXP', 19: 'Supplier', 20: 'Inv.No', 22: 'Rack No.', 23: 'Barcode',
}
_AS_ON = re.compile(r'AS ON DATE\s+(\d{1,2})-(\d{1,2})-(\d{4})', re.I)


def _text(v) -> str:
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip() if v is not None else ''


def _num(v, places='0.0001') -> Decimal:
    if v in ('', None):
        return Decimal('0')
    try:
        return Decimal(repr(float(v))).quantize(Decimal(places))
    except (ValueError, InvalidOperation):
        return Decimal('0')


def parse_stock_rows(rows) -> StockSheet:
    """`rows` = every row of the sheet as a list of cell values (the seam the tests use; `read_stock` feeds it from xlrd)."""
    rows = [list(r) for r in rows]
    head = next((i for i, r in enumerate(rows[:15]) if len(r) > 1 and _text(r[1]) == 'Product Name'), None)
    if head is None:
        raise MargFileError('No "Product Name" header: this is not a Marg stock report.')
    for col, label in STOCK_COLUMNS.items():
        got = _text(rows[head][col]) if col < len(rows[head]) else ''
        if got != label:
            raise MargFileError(f'Column {col + 1} should be "{label}" but is "{got}": the report layout changed.')
    as_on = None
    for r in rows[:head]:
        m = _AS_ON.search(' '.join(_text(c) for c in r))
        if m:
            as_on = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    if as_on is None:
        raise MargFileError('The report does not say "STOCK REPORT AS ON DATE dd-mm-yyyy".')
    # the first cell holds the shop's name and address padded with hundreds of spaces: keep the name
    company = (_text(rows[0][0]) if rows and rows[0] else '').split('   ')[0].strip()
    sheet = StockSheet(company=company, as_on=as_on)
    for i, r in enumerate(rows[head + 1:], start=head + 2):
        r = r + [''] * (24 - len(r))
        name = _text(r[1])
        if not name:
            if isinstance(r[9], float) and r[9]:      # the grand total line
                sheet.total_value = _num(r[9], '0.01')
            continue
        sheet.rows.append(StockRow(
            line=i, code=_text(r[0]), name=name, unit=_text(r[2]), stock=_num(r[3], '0.001'), cost=_num(r[8]),
            value=_num(r[9], '0.01'), mrp=_num(r[10], '0.01'), purchase_price=_num(r[11]), company=_text(r[13]),
            batch=_text(r[16]), expiry=_text(r[18]), supplier=_text(r[19]), invoice_no=_text(r[20]), rack=_text(r[22]),
            sticker=_text(r[23]),
        ))
    if not sheet.rows:
        raise MargFileError('The stock report has no rows.')
    return sheet


def read_stock(path) -> StockSheet:
    if not str(path).lower().endswith('.xls'):
        raise MargFileError('The stock report must be the .xls file Marg exports.')
    import xlrd   # only needed here; the rest of the loader is testable without it
    ws = xlrd.open_workbook(path).sheet_by_index(0)
    return parse_stock_rows(ws.row_values(i) for i in range(ws.nrows))


# ── ledgers, groups and the sale notes (Phase 2) ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MargGroup:
    name: str
    parent: str          # Marg drops "&" when one group points to another: match with rules.name_key


@dataclass(frozen=True)
class MargLedger:
    name: str
    parent: str
    opening: Decimal     # Marg's sign: negative = Dr, positive = Cr
    gstin: str
    pan: str
    address: str
    state: str
    pincode: str


def parse_masters(xml_text: str) -> tuple[list, list]:
    groups, ledgers = [], []
    for _, el in ET.iterparse(io.StringIO(clean_xml(xml_text)), events=('end',)):
        if el.tag == 'GROUP':
            name = (el.get('NAME') or '').strip()
            if name:
                groups.append(MargGroup(name=name, parent=(el.findtext('PARENT') or '').strip()))
            el.clear()
        elif el.tag == 'LEDGER':
            name = (el.get('NAME') or '').strip()
            if name:
                lines = [(a.text or '').strip() for a in el.iter('ADDRESS') if (a.text or '').strip()]
                ledgers.append(MargLedger(
                    name=name, parent=(el.findtext('PARENT') or '').strip(), opening=_dec(el.findtext('OPENINGBALANCE')) or Decimal('0'),
                    gstin=((el.findtext('PARTYGSTIN') or el.findtext('LEDGSTREGDETAILS.LIST/GSTIN') or '').strip().upper()),
                    pan=(el.findtext('INCOMETAXNUMBER') or '').strip().upper(), address=', '.join(lines),
                    state=(el.findtext('LEDSTATENAME') or el.findtext('STATE') or '').strip(),
                    pincode=(el.findtext('LEDMAILINGDETAILS.LIST/PINCODE') or '').strip(),
                ))
            el.clear()
        elif el.tag in ('STOCKITEM', 'STOCKGROUP', 'UNIT', 'GODOWN'):
            el.clear()
    if not ledgers:
        raise MargFileError('No ledgers found: this is not a Marg "All Masters" export.')
    return groups, ledgers


def read_masters(path):
    with open(path, 'r', encoding='latin-1') as fh:
        return parse_masters(fh.read())


@dataclass(frozen=True)
class SaleNote:
    number: str
    day: date
    party: str           # the ledger the bill was charged to (CASH, PHONE PAY, or a credit customer)
    note: str            # "R000001 9876500001RAVI KUMAR"
    kind: str = 'Sales'  # also 'Purchase': only its number is used (to tell Marg's bills from bills made at the counter)


def parse_sale_notes(xml_text: str) -> list:
    notes = []
    for _, el in ET.iterparse(io.StringIO(clean_xml(xml_text)), events=('end',)):
        if el.tag != 'VOUCHER':
            continue
        kind = (el.get('VCHTYPE') or '')
        if kind in ('Sales', 'Purchase'):
            d = (el.findtext('DATE') or '').strip()
            if len(d) == 8 and d.isdigit():
                notes.append(SaleNote(number=(el.findtext('VOUCHERNUMBER') or '').strip(), day=date(int(d[:4]), int(d[4:6]), int(d[6:])),
                                      party=(el.findtext('PARTYLEDGERNAME') or '').strip(), note=(el.findtext('NARRATION') or '').strip(), kind=kind))
        el.clear()
    return notes


def read_sale_notes(path):
    with open(path, 'r', encoding='latin-1') as fh:
        return parse_sale_notes(fh.read())


# ── the full daybook (Phase 3) ────────────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class MargItemLine:
    name: str
    rate: Decimal          # Marg's rate per its unit ("1000.00/TAB.")
    billed: Decimal        # quantity charged
    actual: Decimal        # quantity that moved (billed + free)
    amount: Decimal        # Marg's sign: negative = Dr
    batch: str
    discount: Decimal      # %
    tax_class: str         # "LS-GST 5 %" (local) / "CS-GST 5 %" (central); '' when none
    alloc_ledger: str      # the sales / purchase ledger the line is booked to ('' on the amount-only layout)
    alloc_amount: Decimal | None


@dataclass(frozen=True)
class MargVoucher:
    kind: str              # Sales, Purchase, Sale Return, Purchase Return, Payment, Receipt, Journal, Contra
    number: str
    day: date
    party: str
    note: str
    lines: tuple           # ((ledger name, amount), ...)  Marg's sign: negative = Dr
    items: tuple           # MargItemLine, ...
    amount_layout: bool    # the bill lists its items for information only; the ledger lines carry the money


def _qty(text) -> Decimal:
    return _dec((text or '').split()[0] if (text or '').split() else '') or Decimal('0')


def parse_daybook(xml_text: str) -> list:
    out = []
    for _, el in ET.iterparse(io.StringIO(clean_xml(xml_text)), events=('end',)):
        if el.tag != 'VOUCHER':
            continue
        d = (el.findtext('DATE') or '').strip()
        lines = tuple(((l.findtext('LEDGERNAME') or '').strip(), _dec(l.findtext('AMOUNT')) or Decimal('0'))
                      for l in el.findall('LEDGERENTRIES.LIST') + el.findall('ALLLEDGERENTRIES.LIST'))
        full = el.findall('ALLINVENTORYENTRIES.LIST')
        info = el.findall('INVENTORYALLOCATIONS.LIST')
        items = []
        for i in full or info:
            alloc = i.find('ACCOUNTINGALLOCATIONS.LIST')
            billed = _qty(i.findtext('BILLEDQTY') or i.findtext('ACTUALQTY'))
            items.append(MargItemLine(
                name=(i.findtext('STOCKITEMNAME') or '').strip(), rate=_dec((i.findtext('RATE') or '').split('/')[0]) or Decimal('0'),
                billed=billed, actual=_qty(i.findtext('ACTUALQTY')) or billed, amount=_dec(i.findtext('AMOUNT')) or Decimal('0'),
                batch=(i.findtext('BATCHALLOCATIONS.LIST/BATCHNAME') or '').strip(), discount=_dec(i.findtext('DISCOUNT')) or Decimal('0'),
                tax_class=(i.findtext('ACCOUNTINGALLOCATIONS.LIST/TAXCLASSIFICATIONNAME') or '').strip(),
                alloc_ledger=(alloc.findtext('LEDGERNAME') or '').strip() if alloc is not None and full else '',
                alloc_amount=(_dec(alloc.findtext('AMOUNT')) if alloc is not None and full else None),
            ))
        if len(d) == 8 and d.isdigit():
            out.append(MargVoucher(kind=(el.get('VCHTYPE') or '').strip(), number=(el.findtext('VOUCHERNUMBER') or '').strip(),
                                   day=date(int(d[:4]), int(d[4:6]), int(d[6:])), party=(el.findtext('PARTYLEDGERNAME') or '').strip(),
                                   note=(el.findtext('NARRATION') or '').strip(), lines=lines, items=tuple(items), amount_layout=bool(info) and not full))
        el.clear()
    if not out:
        raise MargFileError('No vouchers found: this is not a Marg daybook export.')
    return out


def read_daybook(path):
    with open(path, 'r', encoding='latin-1') as fh:
        return parse_daybook(fh.read())
