import hashlib
import json
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Dict, Any

def parse_date(date_str: str) -> datetime.date:
    if not date_str:
        raise ValueError("Missing required date field.")
    try:
        return datetime.strptime(date_str, '%d-%m-%Y').date()
    except ValueError:
        raise ValueError(f"Malformed date format: {date_str}. Expected DD-MM-YYYY.")

def extract_monetary(item: Dict[str, Any]) -> Dict[str, Decimal]:
    """
    Extracts monetary values from the document.
    Sometimes values are at the document level, sometimes they are inside an 'itms' array.
    """
    txval = Decimal('0')
    igst = Decimal('0')
    cgst = Decimal('0')
    sgst = Decimal('0')
    cess = Decimal('0')
    
    # Check if they exist at the header level
    if 'txval' in item or 'igst' in item or 'cgst' in item or 'sgst' in item or 'cess' in item:
        try:
            txval = Decimal(str(item.get('txval', 0) or 0))
            igst = Decimal(str(item.get('igst', 0) or 0))
            cgst = Decimal(str(item.get('cgst', 0) or 0))
            sgst = Decimal(str(item.get('sgst', 0) or 0))
            cess = Decimal(str(item.get('cess', 0) or 0))
        except (InvalidOperation, TypeError):
            raise ValueError("Malformed monetary value at header level.")
    else:
        # Sum from items
        for itm in item.get('itms', []):
            det = itm.get('itm_det', {})
            try:
                txval += Decimal(str(det.get('txval', 0) or 0))
                igst += Decimal(str(det.get('iamt', 0) or det.get('igst', 0) or 0))
                cgst += Decimal(str(det.get('camt', 0) or det.get('cgst', 0) or 0))
                sgst += Decimal(str(det.get('samt', 0) or det.get('sgst', 0) or 0))
                cess += Decimal(str(det.get('csamt', 0) or det.get('cess', 0) or 0))
            except (InvalidOperation, TypeError):
                raise ValueError("Malformed monetary value in items array.")
                
    return {
        'txval': txval,
        'igst': igst,
        'cgst': cgst,
        'sgst': sgst,
        'cess': cess,
    }

def normalize_gstr2b_record(category: str, supplier_gstin: str, supplier_name: str, item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalizes a single invoice/note record from GSTR-2B raw payload.
    Supports B2B, B2BA, CDN, CDNA, ISD.
    """
    category = category.lower()
    if category not in ['b2b', 'b2ba', 'cdn', 'cdna', 'isd']:
        raise ValueError(f"Unsupported category: {category}")
        
    doc_type = category.upper()
    source_field_map = {}
    
    # Map invoice number and date
    if category in ['b2b', 'b2ba']:
        inum = item.get('inum')
        idt_str = item.get('idt')
        
        if not idt_str and item.get('dt'):
            idt_str = item.get('dt')
            source_field_map['invoice_date'] = 'dt'
        else:
            source_field_map['invoice_date'] = 'idt'
            
        source_field_map['invoice_number'] = 'inum'
    elif category in ['cdn', 'cdna']:
        inum = item.get('ntnum')
        idt_str = item.get('ntdt')
        source_field_map['invoice_number'] = 'ntnum'
        source_field_map['invoice_date'] = 'ntdt'
    elif category == 'isd':
        inum = item.get('docnum')
        idt_str = item.get('docdt')
        source_field_map['invoice_number'] = 'docnum'
        source_field_map['invoice_date'] = 'docdt'
        
    if not inum:
        raise ValueError("Missing invoice/document number")
        
    invoice_date = parse_date(idt_str)
    
    # Original document references (for amendments)
    original_document_reference = None
    if category in ['b2ba', 'cdna']:
        oinum = item.get('oinum') or item.get('ontnum')
        oidt = item.get('oidt') or item.get('ontdt')
        if oinum and oidt:
            original_document_reference = f"{oinum}|{oidt}"
            source_field_map['original_reference'] = 'oinum|oidt' if 'oinum' in item else 'ontnum|ontdt'
            
    # Monetary values
    monetary = extract_monetary(item)
        
    # Generate raw record hash
    sorted_json = json.dumps(item, sort_keys=True)
    raw_record_hash = hashlib.sha256(sorted_json.encode('utf-8')).hexdigest()
    
    return {
        'supplier_gstin': supplier_gstin,
        'supplier_name': supplier_name,
        'document_type': doc_type,
        'invoice_number': inum,
        'invoice_date': invoice_date,
        'original_document_reference': original_document_reference,
        'taxable_value': monetary['txval'],
        'igst': monetary['igst'],
        'cgst': monetary['cgst'],
        'sgst': monetary['sgst'],
        'cess': monetary['cess'],
        'itc_availability_status': item.get('itcavl', 'N'),
        'ims_status': item.get('imsStatus'),
        'raw_data': item,
        
        'normalizer_version': '1.0',
        'raw_record_hash': raw_record_hash,
        'source_document_type': category,
        'source_field_map': source_field_map
    }
