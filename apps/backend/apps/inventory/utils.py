import math
from decimal import Decimal
from typing import Dict, Any, Union

def quantity_to_pack_display(raw_qty: Union[Decimal, int, float, str], pack_size: int) -> Dict[str, Any]:
    """
    Convert a raw quantity (like from StockLedger or a batch calculation) into 
    strips and loose format.
    
    The system tracks quantity primarily in strips. Fractional parts represent loose units.
    For example, raw_qty = 3.4 with pack_size = 10 means 3 strips + 4 loose units.
    
    Returns:
    {
        "strips": int,
        "loose": int,
        "text": str
    }
    """
    if raw_qty is None:
        return {"strips": 0, "loose": 0, "text": "0"}
    
    try:
        raw_qty = Decimal(str(raw_qty))
    except Exception:
        raw_qty = Decimal('0')
        
    pack_size = int(pack_size) if pack_size else 1
    
    # Handle negative quantities gracefully
    sign = -1 if raw_qty < 0 else 1
    abs_qty = abs(raw_qty)
    
    # Strips is the integer part
    strips = int(math.floor(abs_qty))
    
    # Loose is the fractional part multiplied by pack_size
    fraction = abs_qty - Decimal(str(strips))
    # Round to avoid floating point issues like 3.999999
    loose = int(round(float(fraction) * pack_size))
    
    # Normalize if loose equals or exceeds pack_size (e.g., due to rounding)
    if loose >= pack_size and pack_size > 1:
        extra_strips = loose // pack_size
        strips += extra_strips
        loose = loose % pack_size
    elif loose == 1 and pack_size == 1:
        # If pack size is 1, everything should be in strips
        strips += 1
        loose = 0
        
    strips *= sign
    loose *= sign
    
    if strips == 0 and loose == 0:
        text = "0"
    elif strips != 0 and loose != 0:
        text = f"{strips} strips + {abs(loose)} loose"
    elif strips != 0:
        text = f"{strips} strips"
    else:
        text = f"{loose} loose"
        
    return {
        "strips": strips,
        "loose": loose,
        "text": text
    }
