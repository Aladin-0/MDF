import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

def resolve_unit_rate(batch, billing_basis='MRP', sale_type='RETAIL') -> Decimal:
    """
    Resolve the correct unit rate from the batch based on sale type and billing basis.
    """
    if sale_type == 'RETAIL' or billing_basis == 'MRP':
        return batch.mrp
        
    if sale_type == 'WHOLESALE':
        if billing_basis == 'PTR':
            if batch.ptr and batch.ptr > 0:
                return batch.ptr
            else:
                logger.warning(f"Batch {batch.batch_no} PTR is 0. Falling back to MRP.")
                return batch.mrp
        elif billing_basis == 'PTS':
            if batch.pts and batch.pts > 0:
                return batch.pts
            else:
                logger.warning(f"Batch {batch.batch_no} PTS is 0. Falling back to MRP.")
                return batch.mrp
                
    # Fallback
    return batch.mrp

class TaxCalculatorService:
    @staticmethod
    def calculate_line_tax(taxable_value: Decimal, gst_rate: Decimal, is_interstate: bool) -> dict:
        """
        Calculates CGST/SGST or IGST distribution.
        """
        if not gst_rate or gst_rate == 0:
            return {
                "cgst_rate": Decimal('0'),
                "cgst_amount": Decimal('0.00'),
                "sgst_rate": Decimal('0'),
                "sgst_amount": Decimal('0.00'),
                "igst_rate": Decimal('0'),
                "igst_amount": Decimal('0.00'),
                "total_tax": Decimal('0.00')
            }
            
        tax_amount = (taxable_value * (gst_rate / Decimal('100'))).quantize(Decimal('0.01'))
        
        if is_interstate:
            return {
                "cgst_rate": Decimal('0'),
                "cgst_amount": Decimal('0.00'),
                "sgst_rate": Decimal('0'),
                "sgst_amount": Decimal('0.00'),
                "igst_rate": gst_rate,
                "igst_amount": tax_amount,
                "total_tax": tax_amount
            }
        else:
            half_rate = (gst_rate / Decimal('2')).quantize(Decimal('0.01'))
            half_tax = (taxable_value * (half_rate / Decimal('100'))).quantize(Decimal('0.01'))
            # Calculate exactly to avoid penny rounding errors where cgst + sgst != total tax calculated on full rate
            # Actually standard practice is calculating CGST and SGST individually:
            return {
                "cgst_rate": half_rate,
                "cgst_amount": half_tax,
                "sgst_rate": half_rate,
                "sgst_amount": half_tax,
                "igst_rate": Decimal('0'),
                "igst_amount": Decimal('0.00'),
                "total_tax": half_tax + half_tax
            }

def calculate_line_item(batch, qty_strips: int, qty_loose: int, free_qty_strips: int, trade_discount_percent: Decimal, billing_basis: str, sale_type: str, is_interstate: bool, gst_rate: Decimal) -> dict:
    """
    Computes all rate, discount, and tax calculations for a line item.
    """
    unit_rate = resolve_unit_rate(batch, billing_basis, sale_type)
    
    # Calculate exact quantity as a decimal of strips
    pack_size = Decimal(str(batch.pack_size or 1))
    total_billed_qty = Decimal(str(qty_strips)) + (Decimal(str(qty_loose)) / pack_size)
    
    # Gross amount strictly excludes free quantity
    gross_amount = (total_billed_qty * unit_rate).quantize(Decimal('0.01'))
    
    # Trade discount
    trade_discount_amount = (gross_amount * (trade_discount_percent / Decimal('100'))).quantize(Decimal('0.01'))
    
    # Determine if rate is tax inclusive (MRP is inclusive, PTR/PTS are exclusive)
    is_tax_inclusive = (sale_type == 'RETAIL' or billing_basis == 'MRP')
    
    # Taxable value
    discounted_total = gross_amount - trade_discount_amount
    if is_tax_inclusive and gst_rate > 0:
        taxable_value = (discounted_total * Decimal('100') / (Decimal('100') + gst_rate)).quantize(Decimal('0.01'))
    else:
        taxable_value = discounted_total
    
    # Tax breakdown
    tax_info = TaxCalculatorService.calculate_line_tax(taxable_value, gst_rate, is_interstate)
    
    # Line total
    line_total = taxable_value + tax_info['total_tax']
    
    # Net rate
    total_qty = total_billed_qty + Decimal(str(free_qty_strips))
    net_rate = (line_total / total_qty).quantize(Decimal('0.01')) if total_qty > 0 else Decimal('0.00')
    
    return {
        "unit_rate": unit_rate,
        "gross_amount": gross_amount,
        "trade_discount_percent": trade_discount_percent,
        "trade_discount_amount": trade_discount_amount,
        "taxable_value": taxable_value,
        "tax_info": tax_info,
        "line_total": line_total,
        "net_rate": net_rate
    }
