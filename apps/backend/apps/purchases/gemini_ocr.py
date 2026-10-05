import os
import json
import logging
from typing import Optional, List
from pydantic import BaseModel
from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.genai.errors import APIError

logger = logging.getLogger(__name__)

class GeminiLineItem(BaseModel):
    name: str
    batch_no: Optional[str] = None
    expiry: Optional[str] = None
    qty: Optional[float] = None
    free_qty: Optional[float] = None
    mrp: Optional[float] = None
    rate: Optional[float] = None
    discount: Optional[float] = None
    gst_pct: Optional[float] = None
    amount: Optional[float] = None
    hsn_code: Optional[str] = None
    pack_size: Optional[str] = None

class GeminiHeader(BaseModel):
    distributor_name: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = None
    gstin: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    dl_no: Optional[str] = None

class GeminiTotals(BaseModel):
    subtotal: Optional[float] = None
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    grand_total: Optional[float] = None
    round_off: Optional[float] = None

class GeminiInvoice(BaseModel):
    header: GeminiHeader
    items: List[GeminiLineItem]
    totals: GeminiTotals

@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    retry=retry_if_exception_type(Exception),
    reraise=True
)
def _call_gemini_with_retry(client, sample_file, prompt):
    logger.info("Generating content from Gemini Flash... (with auto-retry)")
    return client.models.generate_content(
        model='gemini-flash-lite-latest',
        contents=[sample_file, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GeminiInvoice,
            temperature=0.0,
        ),
    )

def process_with_gemini(image_path: str, outlet_id: str, api_key: str, match_distributor_fn, match_medicine_fn, calc_confidence_fn) -> dict:
    """Uses Gemini 1.5 Flash to extract invoice data perfectly formatted as JSON."""
    client = genai.Client(api_key=api_key)
    
    from apps.core.models import Outlet
    outlet_gstin = None
    try:
        outlet = Outlet.objects.get(id=outlet_id)
        outlet_gstin = outlet.gstin
    except Exception:
        pass

    logger.info(f"Uploading image to Gemini: {image_path}")
    sample_file = client.files.upload(file=image_path)
    
    prompt = f"""
    You are an expert pharmacy invoice data extractor.
    Extract the following details from this pharmacy invoice image. 
    Return perfectly structured JSON matching the requested schema.
    IMPORTANT: 
    1. The pharmacy's (buyer's) own GSTIN is {outlet_gstin}. DO NOT extract this as the distributor's GSTIN. Only extract the distributor's (seller's) GSTIN.
    2. Convert all dates to YYYY-MM-DD format if possible.
    3. Ensure QTY (quantity), FREE QTY, MRP, and RATE are extracted as numbers.
    4. CRITICAL: You MUST extract the discount percentage (DISC%) for every line item if it exists on the invoice. Do not skip the discount column.
    """
    
    response = _call_gemini_with_retry(client, sample_file, prompt)
    
    logger.info("Gemini response received.")
    data = json.loads(response.text)
    
    # Format Header
    header = data.get('header', {})
    if header.get('gstin'):
        header['state_code'] = header['gstin'][:2]
    else:
        header['state_code'] = None
        
    # Standardize dictionary keys for existing pipeline
    header = {k: v for k, v in header.items() if v is not None}
    
    # Run Distributor Match
    dist_match = match_distributor_fn(outlet_id, header)
    
    # Format Items and Run Medicine Match
    items = data.get('items', [])
    clean_items = []
    for item in items:
        # Convert Pydantic output to flat dict
        item_dict = {k: v for k, v in item.items() if v is not None}
        if item_dict.get('name'):
            med_match = match_medicine_fn(item_dict['name'], outlet_id)
            item_dict['_medicine_match'] = med_match
            item_dict['_validation_ok'] = True
            clean_items.append(item_dict)
            
    # Format Totals
    totals = data.get('totals', {})
    totals = {k: v for k, v in totals.items() if v is not None}
    
    # Calculate Overall Confidence
    confidence = calc_confidence_fn(header, clean_items, totals, dist_match)
    
    return {
        'header': header,
        'items': clean_items,
        'totals': totals,
        'distributor_match': {
            'distributor_id': dist_match.get('distributor_id'),
            'match_tier': dist_match.get('match_tier'),
            'confidence': dist_match.get('confidence'),
            'is_new': dist_match.get('is_new'),
        },
        'column_map': {},
        'confidence': confidence,
        'warnings': ["Processed using Gemini 1.5 Flash"],
    }
