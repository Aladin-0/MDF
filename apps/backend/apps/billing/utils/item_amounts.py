"""
Single source of truth for the per-item money fields (gst_rate / taxable / gst / total) that a
sale payload carries.

The POS always sends ``taxableAmount``, ``gstAmount`` and ``totalAmount`` for every row, but API
clients, imports and older callers may send only some of them. Previously every call site did
``Decimal(str(item_data.get('taxableAmount', 0)))``: a missing field silently became 0, so the
row was stored with taxable=0 / gst=0 (corrupting GST reports), or later tripped the revise
path's row-level tamper check with a misleading "Security Block" error.

``resolve_item_amounts`` derives whatever is missing from what *was* sent, deterministically,
using exact Decimals (banker's rounding to paise, the same rule the POS uses).
"""
from decimal import Decimal
from typing import Any, Dict, Optional

CENT = Decimal('0.01')
HUNDRED = Decimal('100')

# Largest |grand_total - sum(item totals)| a bill may carry as round-off. Anything bigger means the
# client's total does not match its own lines (tampering or a calculation bug) and must be refused
# on every path that persists a bill (create and revise alike).
MAX_ROUND_OFF = Decimal('2.00')


def _to_decimal(value: Any) -> Optional[Decimal]:
    """Decimal for a payload value, or None when the key was absent/blank."""
    if value is None or value == '':
        return None
    return Decimal(str(value))


def _price_from_rate(item_data: Dict[str, Any], gst_rate: Decimal, pack_size: Any, sale_type: str) -> Decimal:
    """Tax-inclusive line total from rate x billed quantity x (1 - discount%)."""
    rate = _to_decimal(item_data.get('rate'))
    if rate is None:
        return Decimal('0')
    pack = Decimal(str(pack_size or 1))
    billed_qty = (Decimal(str(item_data.get('qtyStrips') or 0))
                  + Decimal(str(item_data.get('qtyLoose') or 0)) / pack)
    discount = Decimal(str(item_data.get('discountPct') or 0))
    amount = rate * billed_qty * (Decimal('1') - discount / HUNDRED)
    if (sale_type or 'RETAIL').upper() == 'WHOLESALE':
        amount *= Decimal('1') + gst_rate / HUNDRED
    return amount.quantize(CENT)


def resolve_item_amounts(item_data: Dict[str, Any], default_gst_rate: Any = 0,
                         pack_size: Any = 1, sale_type: str = 'RETAIL') -> Dict[str, Decimal]:
    """
    Return ``{'gst_rate', 'taxable', 'gst', 'total'}`` as Decimals for one payload row.

    Resolution order (tax-inclusive ``totalAmount`` is authoritative when present):
      * gst_rate : ``gstRate`` if sent, else ``default_gst_rate`` (the product's rate).
      * total    : ``totalAmount`` when > 0, else ``taxableAmount + gstAmount``.
      * taxable  : ``taxableAmount`` if sent together with ``gstAmount``; otherwise derived
                   from total: ``total / (1 + rate/100)``.
      * gst      : ``gstAmount`` if sent with ``taxableAmount``; otherwise ``total - taxable``.

    When no amount at all was sent, the line is priced from ``rate x billed qty x (1 - discount)``
    exactly as the create view does (RETAIL rates are tax-inclusive; WHOLESALE rates are
    tax-exclusive and GST is added on top). With no rate either, every amount is 0 (e.g. a 100%
    free-scheme row).
    """
    sent_rate = _to_decimal(item_data.get('gstRate'))
    gst_rate = sent_rate if sent_rate is not None else (_to_decimal(default_gst_rate) or Decimal('0'))

    total_in = _to_decimal(item_data.get('totalAmount'))
    taxable_in = _to_decimal(item_data.get('taxableAmount'))
    gst_in = _to_decimal(item_data.get('gstAmount'))

    if total_in is not None and total_in > 0:
        total = total_in
    elif taxable_in is not None or gst_in is not None:
        total = (taxable_in or Decimal('0')) + (gst_in or Decimal('0'))
    else:
        total = _price_from_rate(item_data, gst_rate, pack_size, sale_type)

    if taxable_in is not None and gst_in is not None:
        taxable, gst = taxable_in, gst_in
    elif taxable_in is not None and total > 0:
        taxable = taxable_in
        gst = total - taxable
    elif gst_in is not None and total > 0:
        gst = gst_in
        taxable = total - gst
    elif total > 0:
        taxable = (total / (Decimal('1') + gst_rate / HUNDRED)).quantize(CENT)
        gst = total - taxable
    else:
        taxable, gst = Decimal('0'), Decimal('0')

    return {'gst_rate': gst_rate, 'taxable': taxable, 'gst': gst, 'total': total}


def split_amounts(amounts: Dict[str, Decimal], shares: list) -> list:
    """
    Apportion one payload row's amounts across several stock allocations (FEFO can spread one
    billed line over multiple batches). ``shares`` are non-negative weights, usually the quantity
    taken from each batch. The last allocation absorbs the paise remainder so the parts always
    add back to the whole; previously every split row was stored with the *full* amounts, which
    multiplied the line's taxable value and GST by the number of batches.
    """
    if len(shares) <= 1:
        return [dict(amounts) for _ in shares] or [dict(amounts)]

    weights = [Decimal(str(w)) for w in shares]
    total_weight = sum(weights)
    if total_weight <= 0:
        weights = [Decimal('1')] * len(weights)
        total_weight = Decimal(len(weights))

    parts = []
    allocated = {k: Decimal('0') for k in ('taxable', 'gst', 'total')}
    for idx, weight in enumerate(weights):
        part = {'gst_rate': amounts['gst_rate']}
        for key in ('taxable', 'gst', 'total'):
            if idx == len(weights) - 1:
                part[key] = amounts[key] - allocated[key]
            else:
                part[key] = (amounts[key] * weight / total_weight).quantize(CENT)
                allocated[key] += part[key]
        parts.append(part)
    return parts
