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
    Validates a sale rate against the landing cost floor and MRP ceiling.
    Returns:
        {
            'valid': bool,
            'block': bool,
            'message': str,
            'landing_cost': Decimal,
            'mrp': Decimal,
        }
    """
    landing_cost = get_landing_cost_for_batch(batch, pharmacy_id)
    mrp = batch.mrp

    if sale_rate > mrp:
        return {
            'valid': False, 'block': True,
            'message': f"Sale rate ₹{sale_rate} exceeds MRP ₹{mrp}. Cannot bill above MRP.",
            'landing_cost': landing_cost, 'mrp': mrp
        }

    if landing_cost > Decimal('0') and sale_rate < (landing_cost - Decimal('0.005')):
        prod_name = batch.product.name if batch.product else f"Batch {batch.batch_no}"
        return {
            'valid': False, 'block': True,
            'message': (
                f"Loss Sale Prevented: Cannot sell {prod_name} below its purchase rate of ₹{landing_cost:.2f}."
            ),
            'landing_cost': landing_cost, 'mrp': mrp
        }

    return {
        'valid': True, 'block': False,
        'message': '',
        'landing_cost': landing_cost, 'mrp': mrp
    }
