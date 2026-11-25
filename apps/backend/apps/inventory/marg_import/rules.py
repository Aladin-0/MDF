"""Every decision the Marg loader makes, as pure functions: no database, no files. The reasons are in the package docstring."""
import calendar
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from apps.inventory import pack_rules

NO_EXPIRY = date(2099, 12, 31)   # the date the app already reads as "no expiry" (frontend lib/inventory.ts NO_EXPIRY)
NO_BATCH = 'NO-BATCH'
TWO_DP = Decimal('0.01')
HUNDRED = Decimal('100')


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(TWO_DP, rounding=ROUND_HALF_UP)


# ── names ────────────────────────────────────────────────────────────────────────────────────────────────────────

def name_key(name) -> str:
    """Letters and digits only. Marg's XML drops `*`, `/` and `'` ("1*100" becomes "1100"), its Excel keeps them."""
    return re.sub(r'[^A-Z0-9]', '', (name or '').upper())


def same_spelling(a, b) -> bool:
    return ' '.join((a or '').upper().split()) == ' '.join((b or '').upper().split())


def is_blank_text(value) -> bool:
    """Empty, or a placeholder an earlier import typed in ("*", ".", "General")."""
    v = (value or '').strip().upper()
    return not re.search(r'[A-Z0-9]', v) or v in ('GENERAL', 'NA', 'N/A', 'NONE', 'UNKNOWN')


# ── expiry ───────────────────────────────────────────────────────────────────────────────────────────────────────

_MONTHS = {m.upper(): i for i, m in enumerate(calendar.month_abbr) if m}
_EXPIRY = re.compile(r'\s*(\d{1,2})-([A-Za-z]{3})-(\d{4}|\d{2})\s*')


def parse_expiry(text) -> date | None:
    """Marg prints "01-Jun-28" for an expiry of June 2028: good to the END of that month. Blank ("  -   -") = no expiry."""
    m = _EXPIRY.fullmatch(text or '')
    if not m or m.group(2).upper() not in _MONTHS:
        return None
    year = int(m.group(3))
    year += 2000 if year < 100 else 0
    month = _MONTHS[m.group(2).upper()]
    return date(year, month, calendar.monthrange(year, month)[1])


# ── pack ─────────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Pack:
    size: int
    unit: str
    type: str

    def errors(self) -> dict:
        return pack_rules.pack_errors(self.size, self.unit, self.type)

    @property
    def sells_loose(self) -> bool:
        return pack_rules.allows_loose(self.size, self.type)


# Marg units somebody chose on purpose. "TAB" is Marg's default and sits on belts and wheelchairs too, so it says nothing.
_UNIT_KIND = {
    'CAP': 'capsule', 'CAPS': 'capsule', 'STAB': 'tablet', 'STRI': 'tablet',
    'CREA': 'tube', 'OINT': 'tube', 'SYRU': 'bottle', 'SYRP': 'bottle', 'SYP': 'bottle', 'SOLU': 'bottle',
    'LOTI': 'bottle', 'DROP': 'bottle', 'SPRA': 'bottle', 'POWD': 'bottle', 'INJ': 'vial',
}
_KIND_PACK = {   # kind -> (pack_unit, pack_type) for one item of that kind
    'tablet': ('tablet', 'strip'), 'capsule': ('capsule', 'strip'), 'bottle': ('bottle', 'bottle'),
    'tube': ('tube', 'tube'), 'vial': ('vial', 'vial'), 'piece': ('piece', 'piece'),
}
_TABLET = re.compile(r'\b(TAB|TABS|TABLET|TABLETS)\b')
_CAPSULE = re.compile(r'\b(CAPSULE|CAPSULES|SOFTGEL|CAPS)\b')
_CAP = re.compile(r'\bCAP\b')
_WORN_CAP = re.compile(r'\b(KNEE|BOUFANT|BOUFFANT|SURGEON|SURGICAL|HEAD|SHOWER|ELBOW|HEEL|TOE|FINGER|THUMB|ANKLE|NURSE|DISPO|DISPOSABLE)\b')
_LIQUID = re.compile(r'\b(SYRUP|SYP|SUSP|SUSPENSION|SOLUTION|LOTION|DROPS)\b')
_CREAM = re.compile(r'\b(CREAM|OINTMENT|OINT)\b')
_INJECTION = re.compile(r'\b(INJ|INJECTION)\b')
_STRENGTH = re.compile(r'\d\s*(MG|MCG)\b')


def kind_of(name, marg_unit='', pack_text='') -> str:
    """What sort of thing this is, from Marg's unit when it is a deliberate one, else from the words in the name."""
    unit = (marg_unit or '').upper().strip().rstrip('.')
    if unit in _UNIT_KIND:
        return _UNIT_KIND[unit]
    n, t = (name or '').upper(), (pack_text or '').upper()
    if _TABLET.search(n) or re.search(r'\d\s*TABS?$', t):
        return 'tablet'
    if _CAPSULE.search(n) or re.search(r'\d\s*CAPS?$', t) or (_CAP.search(n) and not _WORN_CAP.search(n)):
        return 'capsule'
    if _INJECTION.search(n):
        return 'vial'
    if _CREAM.search(n):
        return 'tube'
    if _LIQUID.search(n):
        return 'bottle'
    if _STRENGTH.search(n):       # "CLAVAM 625MG 10S": a strength and nothing else says tablet
        return 'tablet'
    return 'piece'


def decide_pack(kind: str, conversion: int, existing: Pack | None, keep_label: bool = False) -> tuple[Pack, str]:
    """
    The pack a product and its batches should carry, and where the size came from.

      size  Marg's CONVERSION when it has one (that is the unit Marg's stock numbers are counted in),
            else the size the catalogue already has, else 1.
      type  a pack Marg counts loose units of must be sellable loose: a strip for tablets and capsules; anything else
            keeps the catalogue's label when that already sells loose, and becomes a box of pieces when it does not.
            Otherwise the catalogue's own type and unit stay, except the old import's mix-up (a belt typed
            "strip of 1 tablet"), which becomes one piece.

    `keep_label` (a product another outlet uses): the catalogue's unit and type are never changed, only the size.
    """
    if conversion and conversion > 1:
        size, source = int(conversion), 'Marg'
    elif existing and existing.size > 1:
        size, source = existing.size, 'catalogue'
    else:
        size, source = 1, 'single'

    if keep_label and existing:
        return Pack(size, existing.unit, existing.type), source

    unit, ptype = _KIND_PACK[kind]
    if source == 'Marg':
        if kind not in ('tablet', 'capsule'):
            if existing and not existing.errors() and existing.sells_loose:
                unit, ptype = existing.unit, existing.type
            else:
                unit, ptype = 'piece', 'box'
    elif existing and not existing.errors():
        mixed_up = existing.size == 1 and existing.type in ('strip', 'blister') and kind == 'piece'
        if not mixed_up:
            unit, ptype = existing.unit, existing.type
    pack = Pack(size, unit, ptype)
    if pack.errors():   # cannot happen with the table above; never write a pack the app would refuse
        raise ValueError(f'invalid pack {pack}: {pack.errors()}')
    return pack, source


def usable_conversion(conversion) -> int:
    """Marg's units-in-one-pack, or 0 when it has none or the number cannot be a pack (10500 on a weighing machine)."""
    c = int(conversion or 0)
    return c if 1 < c <= pack_rules.MAX_PURCHASE_PKG else 0


def valid_hsn(hsn) -> bool:
    """An HSN code is 4, 6 or 8 digits. "005" is a typing slip, not a code."""
    h = (hsn or '').strip()
    return h.isdigit() and len(h) in (4, 6, 8)


# ── quantity ─────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Quantity:
    packs: int
    loose: int | None        # None: Marg's number cannot be read with certainty
    choices: tuple = ()      # the possible loose counts when it is ambiguous

    @property
    def clear(self) -> bool:
        return self.loose is not None


def read_quantity(stock: Decimal, pack_size: int) -> Quantity:
    """
    Marg prints the stock of an item that has a pack as `packs.loose`: 3.14 of a pack of 20 is 3 packs + 14, 4.3 of a
    pack of 6 is 4 packs + 3 (checked against Marg's own opening + movements). It is NOT a fraction: 0.5 of a pack of
    24 is 5 loose, not 12. Excel drops a trailing zero, so 0.5 of a pack of 100 may be 5 or 50: that is reported, not
    guessed. An item with no pack (size 1) and a part quantity cannot be read at all.
    """
    stock = Decimal(stock)
    packs = int(stock)
    frac = stock - packs
    if frac == 0:
        return Quantity(packs, 0)
    if pack_size <= 1:
        return Quantity(packs, None)
    digits = format(frac.normalize(), 'f').split('.')[1]
    width = len(str(pack_size - 1))
    n = int(digits)
    choices = tuple(c for c in (n * 10 ** k for k in range(max(width - len(digits), 0) + 1)) if 0 < c < pack_size)
    return Quantity(packs, choices[0]) if len(choices) == 1 else Quantity(packs, None, choices)


# ── prices ───────────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Prices:
    mrp: Decimal
    landing: Decimal
    purchase: Decimal


def prices(cost, purchase_price, mrp, gst) -> Prices:
    """
    landing   Marg's "Cost Price": what a pack cost the shop, GST included where it was charged.
    purchase  Marg's "Purchase Price" when it is not above the cost. On a third of the rows it IS above (it holds the
              list price or the MRP); wholesale billing holds a sale to the purchase rate, so there the cost without GST.
    mrp       as printed. Zero stays zero and is reported: it is never invented.
    """
    cost, purchase_price = Decimal(cost or 0), Decimal(purchase_price or 0)
    if cost <= 0:
        return Prices(money(mrp), money(purchase_price), money(purchase_price))
    if 0 < purchase_price <= cost + TWO_DP:
        purchase = money(purchase_price)
    else:
        purchase = money(cost / (1 + Decimal(gst or 0) / HUNDRED))
    return Prices(money(mrp), money(cost), purchase)


def cost_looks_per_piece(landing, mrp, pack_size) -> bool:
    """A whole pack at this cost would still be under the MRP of one pack: the cost was typed per piece (a box of 100 at Rs 3)."""
    return pack_size > 1 and mrp > 0 and landing > 0 and landing * pack_size <= mrp
