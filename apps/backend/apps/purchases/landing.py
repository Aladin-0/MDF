"""
Landing cost: what one pack really cost the shop. ONE rule, in this file.

    cost after discounts, spread over paid + free packs
        + GST and cess, when the outlet counts GST as a cost (Settings: "landing cost includes GST",
          or the outlet is not GST registered and cannot claim it back)
        + freight and other costs per pack

It is worked out when a purchase is saved or edited and written onto the BATCH (`Batch.landing_rate`), because the
batch is what billing sells from: the loss-sale floor, the margin shown at the counter and the "Landing" stock value all
read the batch. It used to be stored only on the purchase line. Every batch received through a purchase therefore had
no landing cost, and billing fell back to the PTR printed on the supplier's bill, which is neither what was paid (free
goods and discounts are ignored) nor "cost + GST".
"""
from decimal import Decimal

FOUR_DP = Decimal('0.0001')
TWO_DP = Decimal('0.01')
HUNDRED = Decimal('100')


def _d(value) -> Decimal:
    return Decimal(str(value if value not in (None, '') else 0))


def landing_includes_gst(outlet) -> bool:
    """Does this outlet count GST as part of what stock cost? (It does when it cannot claim the GST back.)"""
    settings = getattr(outlet, 'settings', None)
    if not settings:
        return False
    return (not settings.gst_registered) or bool(settings.landing_cost_include_gst)


def effective_rate(purchase_rate, qty, free_qty=0, discount_pct=0, cash_discount_pct=0) -> Decimal:
    """What one pack cost before tax: the bill rate less both discounts, spread over paid AND free packs."""
    rate, paid, free = _d(purchase_rate), _d(qty), _d(free_qty)
    packs = paid + free
    if packs <= 0:
        return rate
    paid_for = rate * paid * (Decimal('1') - _d(discount_pct) / HUNDRED) * (Decimal('1') - _d(cash_discount_pct) / HUNDRED)
    return (paid_for / packs).quantize(FOUR_DP)


def landing_rate_per_pack(purchase_rate, qty, free_qty=0, discount_pct=0, cash_discount_pct=0, gst_rate=0, cess_pct=0,
                          freight_per_unit=0, other_cost_per_unit=0, include_gst=False) -> Decimal:
    """Landing cost of one pack on a purchase line (4 decimals; a batch stores it to 2, see `for_batch`)."""
    base = effective_rate(purchase_rate, qty, free_qty, discount_pct, cash_discount_pct)
    landing = base
    if include_gst:
        landing += (base * (_d(gst_rate) + _d(cess_pct)) / HUNDRED).quantize(FOUR_DP)
    return landing + _d(freight_per_unit) + _d(other_cost_per_unit)


def for_batch(landing_rate) -> Decimal:
    """The figure as a batch stores it."""
    return _d(landing_rate).quantize(TWO_DP)


def landing_from_purchase_item(item, include_gst: bool) -> Decimal:
    """The same rule for a purchase line that is already saved (used to fill in batches that never got a landing cost)."""
    return landing_rate_per_pack(
        item.purchase_rate, item.qty, item.free_qty, item.discount_pct, item.cash_discount_pct, item.gst_rate, item.cess,
        item.freight_per_unit, item.other_cost_per_unit, include_gst=include_gst,
    )
