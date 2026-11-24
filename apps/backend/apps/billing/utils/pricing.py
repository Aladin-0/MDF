from decimal import Decimal
from apps.purchases.models import PurchaseItem
from apps.inventory.models import Batch
from apps.core.models import OutletSettings

def get_pharmacy_settings(pharmacy_id) -> OutletSettings:
    """Fetch pharmacy settings safely with defaults."""
    try:
        return OutletSettings.objects.get(outlet_id=pharmacy_id)
    except OutletSettings.DoesNotExist:
        return None

def get_landing_cost_for_batch(batch: Batch, pharmacy_id) -> Decimal:
    """
    Returns the minimum sale price floor for a given purchase batch.
    Reads the pharmacy GST toggle from settings.
    """
    pharmacy_settings = get_pharmacy_settings(pharmacy_id)
    include_gst = getattr(pharmacy_settings, 'landing_cost_include_gst', False) if pharmacy_settings else False
    
    # Try to find the most recent PurchaseItem for this batch since Landing Cost
    # logic and parameters (freight, gst_rate) exist on PurchaseItem, not Batch.
    purchase_item = PurchaseItem.objects.filter(batch=batch).order_by('-created_at').first()
    if purchase_item:
        return purchase_item.get_landing_cost(include_gst=include_gst)
    
    # Check if batch has ptr > 0 or landing_rate > 0
    if batch.ptr and batch.ptr > Decimal('0'):
        return batch.ptr
    if batch.landing_rate and batch.landing_rate > Decimal('0'):
        return batch.landing_rate

    # Fallback if no PurchaseItem exists (e.g. Opening Stock injection without PO)
    base = batch.purchase_rate or Decimal('0')
    # Without PurchaseItem, we don't know the exact GST rate, freight, etc.
    return base.quantize(Decimal('0.0001'))

def validate_sale_price(sale_rate: Decimal, batch: Batch, pharmacy_id) -> dict:
    """
    Validates a sale rate against the MRP ceiling.
    Returns:
        {
            'valid': bool,
            'block': bool,
            'message': str,
            'landing_cost': Decimal,
            'mrp': Decimal,
        }
    """
    mrp = batch.mrp

    if mrp and sale_rate > (mrp + Decimal('0.005')):
        return {
            'valid': False, 'block': True,
            'message': f"Sale rate ₹{sale_rate} exceeds MRP ₹{mrp}. Cannot bill above MRP.",
            # only shown with the refusal; looking it up costs 2 queries, so it is no longer done for every line billed
            'landing_cost': get_landing_cost_for_batch(batch, pharmacy_id), 'mrp': mrp
        }

    # landing_cost is only ever read when the sale is blocked (every caller checks 'block' first)
    return {
        'valid': True, 'block': False,
        'message': '',
        'landing_cost': None, 'mrp': mrp
    }


def cost_floor_per_pack(batch: Batch, sale_type: str = 'RETAIL'):
    """
    The least one pack of this batch may sell for (before the GST adjustment), and what to call it.

    THE rule, in one place. Every sale path and the billing screen read it from here (the screen gets it as
    `retailCostFloor` / `wholesaleCostFloor` on each batch, see `cost_floors`):
      * RETAIL    : landing_rate, else purchase_rate, else ptr   ("landing cost")
      * WHOLESALE : purchase_rate, else pts, else landing_rate, else ptr   ("purchase rate")

    A retail sale is held to what the shop PAID. `landing_rate` is that figure (cost after discounts and free goods,
    plus GST when the outlet counts it, plus freight: purchases/landing.py writes it on every purchase). A batch with
    no landing cost falls back to its purchase rate ("an empty landing cost means the same as the purchase rate",
    docs/INVENTORY.md). The PTR is only the last resort: it is the supplier's list price, and it used to be tried
    BEFORE the purchase rate, so a batch bought 30 + 10 free at ₹19.49 (₹14.62 a pack) could not be sold under ₹19.49.

    There used to be five copies of this rule and the screen had its own. The copies disagreed, the screen gave a line
    more bill discount than the server allowed, and the bill was refused with "Security Block: Invalid Round Off".
    """
    zero = Decimal('0')
    if (sale_type or 'RETAIL').upper() == 'WHOLESALE':
        if batch.purchase_rate and batch.purchase_rate > zero:
            return batch.purchase_rate, 'purchase rate'
        if batch.pts and batch.pts > zero:
            return batch.pts, 'purchase rate'
        return (batch.landing_rate or batch.ptr or zero), 'purchase rate'
    if batch.landing_rate and batch.landing_rate > zero:
        return batch.landing_rate, 'landing cost'
    if batch.purchase_rate and batch.purchase_rate > zero:
        return batch.purchase_rate, 'landing cost'
    return (batch.ptr or zero), 'landing cost'


def cost_floors(batch: Batch) -> dict:
    """What the billing screen needs to cap discounts exactly as the server will: both floors, per pack."""
    return {
        'retailCostFloor': float(cost_floor_per_pack(batch, 'RETAIL')[0]),
        'wholesaleCostFloor': float(cost_floor_per_pack(batch, 'WHOLESALE')[0]),
    }


def line_cost_floor(batch: Batch, sale_type: str, qty_strips, qty_loose, gst_rate,
                    landing_cost_include_gst: bool = False) -> dict:
    """
    Minimum tax-inclusive amount a billed line may total without being a loss sale.

    Same rule the sale-create view enforces, exposed once so revisions cannot bypass it:
      * RETAIL    : floor per pack = landing_rate, else purchase_rate, else ptr  ("landing cost")
      * WHOLESALE : floor per pack = purchase_rate, else pts, else landing_rate/ptr ("purchase rate")
      * GST is added on top of the floor unless the outlet's landing cost already includes GST.
      * Only *billed* quantity counts; free-scheme quantity never inflates the floor.

    Returns ``{'cost_floor', 'label', 'line_floor', 'billed_qty'}``; ``line_floor`` is 0 when there
    is nothing to protect (no cost recorded, or a 100% free line).
    """
    zero = Decimal('0')
    cost_floor, label = cost_floor_per_pack(batch, sale_type)

    pack_size = Decimal(str(batch.pack_size or 1))
    billed_qty = Decimal(str(qty_strips or 0)) + Decimal(str(qty_loose or 0)) / pack_size
    if cost_floor <= zero or billed_qty <= zero:
        return {'cost_floor': cost_floor, 'label': label, 'line_floor': zero, 'billed_qty': billed_qty}

    tax_multiplier = Decimal('1') + Decimal(str(gst_rate or 0)) / Decimal('100')
    cost_tax_multiplier = Decimal('1') if landing_cost_include_gst else tax_multiplier
    line_floor = (cost_floor * cost_tax_multiplier * billed_qty).quantize(Decimal('0.01'))
    return {'cost_floor': cost_floor, 'label': label, 'line_floor': line_floor, 'billed_qty': billed_qty}
