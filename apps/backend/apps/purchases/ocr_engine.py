"""
Scan Purchase — OCR Engine
==========================
Handles end-to-end invoice image processing:
  1. Image preprocessing  (OpenCV: deskew, binarize, denoise)
  2. OCR text extraction  (RapidOCR)
  3. Zone-based parsing   (header / item-table / footer)
  4. Distributor matching (GSTIN → learned alias → phone/DL → distinctive name)
  5. Dynamic column-header detection & line-item extraction

Usage (called from Celery task):
    from apps.purchases.ocr_engine import process_invoice_image
    result = process_invoice_image(image_path, outlet_id)
"""

import re
import os
import logging
from datetime import datetime
from difflib import SequenceMatcher

import numpy as np

from PIL import Image

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# COLUMN HEADER SYNONYM MAP
# Built from analysis of 89 real invoices across 74 distributors
# ---------------------------------------------------------------------------
COLUMN_SYNONYM_MAP = {
    # Product Name
    "product": "name", "medicine": "name", "description": "name",
    "particulars": "name", "item": "name", "drug name": "name",
    "item description": "name", "product name": "name", "items": "name",
    "drug": "name", "trade name": "name", "name": "name",

    # Batch Number
    "batch": "batch_no", "b.no": "batch_no", "lot": "batch_no",
    "lot no": "batch_no", "b/n": "batch_no", "batch no": "batch_no",
    "batch no.": "batch_no", "b.no.": "batch_no", "lot number": "batch_no",

    # Expiry Date
    "exp": "expiry", "expiry": "expiry", "exp.": "expiry",
    "exp date": "expiry", "exp dt": "expiry", "e/d": "expiry",
    "expiry date": "expiry", "exp. date": "expiry", "exp.date": "expiry",
    "mfg exp": "expiry",

    # Quantity (billed)
    "qty": "qty", "pcs": "qty", "units": "qty",
    "b.qty": "qty", "quantity": "qty", "nos": "qty",
    "pack qty": "qty", "billed qty": "qty", "bill qty": "qty",

    # Free / Scheme Quantity
    "free": "free_qty", "sch": "free_qty", "scheme": "free_qty",
    "s.qty": "free_qty", "bonus": "free_qty", "sch qty": "free_qty",
    "free qty": "free_qty", "f.qty": "free_qty", "bonus qty": "free_qty",
    "scheme qty": "free_qty",

    # MRP
    "mrp": "mrp", "m.r.p": "mrp", "max price": "mrp", "mrp/unit": "mrp",
    "m.r.p.": "mrp", "maxretailprice": "mrp",

    # Rate / PTR / PTS
    "rate": "rate", "ptr": "rate", "pts": "rate", "unit rate": "rate",
    "net rate": "rate", "p.t.r.": "rate", "p.t.s.": "rate",
    "purchase rate": "rate", "rate/unit": "rate", "s.rate": "rate",
    "selling rate": "rate",

    # Discount
    "disc": "discount", "disc%": "discount", "dis%": "discount",
    "d%": "discount", "sch%": "discount", "trade disc": "discount",
    "cd%": "discount", "discount": "discount", "disc %": "discount",
    "dis.": "discount", "cash disc": "discount",

    # GST / Tax
    "gst": "gst_pct", "tax%": "gst_pct", "cgst": "gst_pct",
    "sgst": "gst_pct", "igst": "gst_pct", "tax rate": "gst_pct",
    "gst%": "gst_pct", "gst rate": "gst_pct", "vat%": "gst_pct",

    # Amount
    "amt": "amount", "amount": "amount", "total": "amount",
    "net amt": "amount", "value": "amount", "net amount": "amount",
    "taxable amt": "amount", "taxable amount": "amount",

    # HSN Code
    "hsn": "hsn_code", "hsn/sac": "hsn_code", "sac": "hsn_code",
    "hsn code": "hsn_code", "hsn no": "hsn_code",

    # Pack Size
    "pack": "pack_size", "pkg": "pack_size", "packing": "pack_size", "size": "pack_size",
    "pack size": "pack_size", "unit": "pack_size", "uom": "pack_size",
    "uqc": "pack_size",
}

# ---------------------------------------------------------------------------
# HEADER EXTRACTION PATTERNS
# ---------------------------------------------------------------------------
INVOICE_NO_PATTERNS = [
    r'(?:INV(?:OICE)?\.?\s*NO\.?|BILL\s*NO\.?|MEMO\s*NO\.?|Inv\.No\.:?|Invoice\s*No\.?:?|Bill\s*No\.?:?)\s*[:\-]?\s*([A-Z0-9/_\-]+)',
]
DATE_PATTERNS = [
    r'(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{4})',
    r'(\d{2}[\/\.\-]\d{2}[\/\.\-]\d{2})',
    r'(\d{4}[\/\.\-]\d{2}[\/\.\-]\d{2})',
]
DATE_KEYWORDS = ['INV.DT', 'INVOICE DATE', 'INV DATE', 'BILL DATE', 'DATE', 'DT.']
GSTIN_PATTERN = re.compile(r'([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])')
DL_PATTERN = re.compile(r'(?:DL\s*NO|D\.L\.No|DRUG\s*LICEN[SC]E\s*NO)[.:\s]*([A-Z0-9\-,\s]+)', re.IGNORECASE)
DL_20B_PATTERN = re.compile(r'20B[-\s]+([\w\-]+)', re.IGNORECASE)
DL_21B_PATTERN = re.compile(r'21B[-\s]+([\w\-]+)', re.IGNORECASE)
PHONE_PATTERN = re.compile(r'(?<!\d)(\d{10})(?!\d)|(?:\+91[-\s]?)(\d{10})|(?:0)(\d{9,10})')


# ---------------------------------------------------------------------------
# 1. IMAGE PREPROCESSING
# ---------------------------------------------------------------------------
def preprocess_image(image_path: str) -> np.ndarray:
    """
    Apply OpenCV preprocessing to maximise OCR accuracy on mobile photos.
    Steps: load → auto-rotate (EXIF + content analysis) → grayscale → denoise → adaptive threshold → deskew
    """
    import cv2

    # Step 1: Load with PIL first to honour EXIF orientation tag
    try:
        from PIL import Image as PilImage, ExifTags
        pil_img = PilImage.open(image_path)
        # Auto-rotate based on EXIF orientation
        exif = pil_img._getexif() if hasattr(pil_img, '_getexif') else None
        if exif:
            for tag_id, value in exif.items():
                tag = ExifTags.TAGS.get(tag_id)
                if tag == 'Orientation':
                    if value == 3:
                        pil_img = pil_img.rotate(180, expand=True)
                    elif value == 6:
                        pil_img = pil_img.rotate(270, expand=True)
                    elif value == 8:
                        pil_img = pil_img.rotate(90, expand=True)
                    break
        # Convert to numpy for OpenCV
        img = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
    except Exception:
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not load image: {image_path}")

    # Step 2: If image is in portrait but text appears sideways, try to fix it
    # Detect if image needs rotation: if width > height it's landscape and likely needs 90deg rotation
    h, w = img.shape[:2]
    if w > h * 1.3:
        # Landscape image — rotate 90 degrees clockwise so text reads left-to-right
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
        h, w = img.shape[:2]

    # Step 3: Resize to standard width while keeping aspect ratio (OCR performs best around 2000px wide)
    if w > 2500:
        scale = 2500 / w
        img = cv2.resize(img, (2500, int(h * scale)), interpolation=cv2.INTER_LANCZOS4)

    # Step 4: Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Step 5: Denoise
    gray = cv2.fastNlMeansDenoising(gray, h=10)

    # Step 6: Adaptive threshold — handles uneven lighting / shadows
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        21, 10
    )

    # Step 7: Deskew — straighten slightly rotated images
    binary = _deskew(binary)

    return binary


def _deskew(image: np.ndarray) -> np.ndarray:
    """Detect and correct skew angle using Hough line transform."""
    try:
        import cv2

        edges = cv2.Canny(image, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi / 180, 200)
        if lines is None:
            return image

        angles = []
        for line in lines[:20]:
            rho, theta = line[0]
            angle = (theta * 180 / np.pi) - 90
            if abs(angle) < 15:
                angles.append(angle)

        if not angles:
            return image

        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return image

        h, w = image.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h),
                                  flags=cv2.INTER_CUBIC,
                                  borderMode=cv2.BORDER_REPLICATE)
        return rotated
    except Exception:
        return image


# ---------------------------------------------------------------------------
# 2. OCR TEXT EXTRACTION
# ---------------------------------------------------------------------------
def extract_text_blocks(image_path: str) -> list[dict]:
    """
    Run RapidOCR on the preprocessed image.
    Returns list of {text, x, y, w, h, confidence} dicts sorted top→bottom left→right.
    """
    import cv2
    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()
        preprocessed = preprocess_image(image_path)
        results, _ = engine(preprocessed)
        if not results:
            return []

        blocks = []
        vertical_count = 0
        horizontal_count = 0

        for item in results:
            if len(item) < 3:
                continue
            box, text, conf = item[0], item[1], item[2]
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            w = max(xs) - min(xs)
            h = max(ys) - min(ys)
            
            # Count orientation for long text blocks
            if len(text.strip()) > 3:
                if h > w * 1.5:
                    vertical_count += 1
                elif w > h * 1.5:
                    horizontal_count += 1

            blocks.append({
                'text': text.strip(),
                'x': min(xs),
                'y': min(ys),
                'w': w,
                'h': h,
                'conf': conf,
            })

        # Auto-correct rotated text
        if vertical_count > horizontal_count * 2 and vertical_count > 5:
            logger.info(f"Detected sideways text ({vertical_count} vertical vs {horizontal_count} horizontal). Rotating 90 degrees CCW and retrying.")
            preprocessed = cv2.rotate(preprocessed, cv2.ROTATE_90_COUNTERCLOCKWISE)
            results, _ = engine(preprocessed)
            if not results:
                return []
            
            blocks = []
            for item in results:
                if len(item) < 3:
                    continue
                box, text, conf = item[0], item[1], item[2]
                xs = [p[0] for p in box]
                ys = [p[1] for p in box]
                blocks.append({
                    'text': text.strip(),
                    'x': min(xs),
                    'y': min(ys),
                    'w': max(xs) - min(xs),
                    'h': max(ys) - min(ys),
                    'conf': conf,
                })

        # Sort top-to-bottom, then left-to-right within same row
        blocks.sort(key=lambda b: (round(b['y'] / 20) * 20, b['x']))
        return blocks

    except Exception:
        logger.exception("OCR extraction failed")
        raise


# ---------------------------------------------------------------------------
# 3. ZONE SPLITTER
# ---------------------------------------------------------------------------
def split_zones(blocks: list[dict]) -> tuple[list, list, list]:
    """
    Split OCR blocks into 3 zones based on position.
    Returns (header_blocks, table_blocks, footer_blocks)

    Strategy:
    - Header zone: top 30% of image by Y coordinate
    - Footer zone: bottom 20% of image by Y coordinate  
    - Table zone: the middle section
    - For header parsing we also return ALL blocks since GSTIN/invoice number
      may appear anywhere on the page.
    """
    if not blocks:
        return [], [], []

    max_y = max(b['y'] + b['h'] for b in blocks)

    header_blocks = [b for b in blocks if (b['y'] + b['h'] / 2) / max_y < 0.30]
    footer_blocks = [b for b in blocks if (b['y'] + b['h'] / 2) / max_y > 0.80]
    table_blocks = [b for b in blocks if b not in header_blocks and b not in footer_blocks]

    # If very few header blocks found (< 5), widen to top 50%
    # This handles invoices where header spreads out more
    if len(header_blocks) < 5:
        header_blocks = [b for b in blocks if (b['y'] + b['h'] / 2) / max_y < 0.50]

    return header_blocks, table_blocks, footer_blocks


# ---------------------------------------------------------------------------
# 4. HEADER PARSER — Invoice No, Date, GSTIN, DL, Phone, Distributor Name
# ---------------------------------------------------------------------------
def parse_header(header_blocks: list[dict], all_blocks: list[dict] = None, outlet_gstin: str = None) -> dict:
    """
    Extract all key invoice header fields from OCR blocks.
    Uses header_blocks for distributor name (top of page),
    but searches ALL blocks for structured data like GSTIN, invoice number, date.
    """
    # Use all_blocks for searching structured patterns (GSTIN, invoice no etc.)
    # Fall back to header_blocks if all_blocks not provided
    search_blocks = all_blocks if all_blocks else header_blocks
    lines = [b['text'] for b in header_blocks]
    all_lines = [b['text'] for b in search_blocks]
    full_text = ' '.join(all_lines)  # Search entire page for structured data
    header_text = ' '.join(lines)

    result = {
        'distributor_name': None,
        'invoice_no': None,
        'invoice_date': None,
        'gstin': None,
        'phone': None,
        'mobile': None,
        'dl_no': None,
        'dl_20b': None,
        'dl_21b': None,
        'address': None,
        'state_code': None,
    }

    # --- Distributor Name: The SELLER, usually the largest header at the very top ---
    # Invoice header zone contains: seller name, address, GSTIN
    # We look for the company name in the first few lines by business keywords.
    # IMPORTANT: The buyer info ("M/s XYZ Medical") may also appear — we must pick the SELLER
    # The seller's name is almost always in the top 8 lines of the header.
    name_candidates = []
    for idx, b in enumerate(header_blocks[:20]):
        clean = b['text'].strip()
        h = b.get('h', 10)  # Use height as a major weight (seller name is largest)
        if len(clean) < 4:
            continue
        # Skip lines that are purely numeric or symbols
        if re.match(r'^[\d\s\W]+$', clean):
            continue
        # Skip buyer prefix patterns like 'M/s', 'To:', 'Ship To', including OCR typos like 'MHs-'
        if re.match(r'^(?:M[/\-\\H]?s\.?[\-\s]?|TO:|BILL TO|SHIP TO|SOLD TO)', clean, re.IGNORECASE):
            continue
            
        # Base score based on index (higher up is slightly better)
        score = idx * 5 
        
        # Substantially reward large text (h)
        score -= int(h)
        
        business_kws = [
            'PHARMA', 'DRUG', 'MEDICAL', 'AGENCY', 'AGENCIES', 'ENTERPRISES',
            'DISTRIBUTOR', 'LOGISTICS', 'CHEMIST', 'LTD', 'PVT', 'CORP',
            'TRADERS', 'SURGICAL', 'HEALTH', 'CARE', 'MEDI', 'MEDICO',
            'STORES', 'WHOLESALE', 'RETAIL', 'CO.', 'COMPANY', 'SALES',
        ]
        if any(kw in clean.upper() for kw in business_kws):
            score -= 50  # Strong preference: has business keyword
        elif clean.isupper() and len(clean) > 6:
            score -= 10   # Moderate preference: all-caps
        elif len(clean) > 6 and not re.search(r'\d{5,}', clean):
            score -= 5   # Weak preference: reasonable length
        else:
            continue
        name_candidates.append((score, clean))

    if name_candidates:
        name_candidates.sort(key=lambda x: x[0])
        result['distributor_name'] = _clean_name(name_candidates[0][1])
    elif lines:
        result['distributor_name'] = _clean_name(lines[0])

    # --- Invoice Number ---
    for pattern in INVOICE_NO_PATTERNS:
        m = re.search(pattern, full_text, re.IGNORECASE)
        if m:
            result['invoice_no'] = m.group(1).strip().rstrip('.,')
            break

    # Fallback: look for number like AMS26/41609, DKS00876, A002444
    if not result['invoice_no']:
        m = re.search(
            r'(?:No|NO|Inv|INV)[.:\s]+([A-Z]{1,5}[\d/_\-]{3,15})',
            full_text, re.IGNORECASE
        )
        if m:
            result['invoice_no'] = m.group(1).strip()

    # --- Invoice Date ---
    # First try lines with date keywords
    for line in lines:
        line_upper = line.upper()
        if any(kw in line_upper for kw in DATE_KEYWORDS):
            for dp in DATE_PATTERNS:
                m = re.search(dp, line)
                if m:
                    result['invoice_date'] = _normalise_date(m.group(1))
                    break
        if result['invoice_date']:
            break

    # Fallback: first date-shaped string in header
    if not result['invoice_date']:
        for dp in DATE_PATTERNS:
            m = re.search(dp, full_text)
            if m:
                result['invoice_date'] = _normalise_date(m.group(1))
                break

    # --- GSTIN ---
    gstins = GSTIN_PATTERN.findall(full_text)
    for g in gstins:
        if outlet_gstin and g.upper() == outlet_gstin.upper():
            continue
        result['gstin'] = g
        result['state_code'] = g[:2]
        break

    # Also check for explicit "State Code: 27" patterns
    sc_m = re.search(r'State\s*Code\s*[:\s]+(\d{2})', full_text, re.IGNORECASE)
    if sc_m:
        result['state_code'] = sc_m.group(1)

    # --- Drug Licence ---
    dl_m = DL_PATTERN.search(full_text)
    if dl_m:
        result['dl_no'] = dl_m.group(1).strip()[:100]
    m20 = DL_20B_PATTERN.search(full_text)
    m21 = DL_21B_PATTERN.search(full_text)
    if m20:
        result['dl_20b'] = m20.group(1).strip()
    if m21:
        result['dl_21b'] = m21.group(1).strip()

    # --- Phone / Mobile ---
    phones = []
    for m in PHONE_PATTERN.finditer(full_text):
        phone = (m.group(1) or m.group(2) or m.group(3) or '').strip()
        if phone and phone not in phones:
            phones.append(phone)
    if phones:
        result['mobile'] = phones[0]
        if len(phones) > 1:
            result['phone'] = phones[1]

    # --- Address: lines between name and invoice number area ---
    addr_lines = []
    for line in lines:
        if any(kw in line.upper() for kw in ['ROAD', 'NAGAR', 'STREET', 'SHOP', 'FLOOR', 'PLOT', 'COMPLEX', 'COLONY']):
            addr_lines.append(line)
    if addr_lines:
        result['address'] = ', '.join(addr_lines[:3])

    return result


def _clean_name(name: str) -> str:
    """Remove OCR artifacts like colons, slashes from the start of a name."""
    return re.sub(r'^[:\s/M\/s]+', '', name).strip()


def _normalise_date(date_str: str) -> str | None:
    """Try to parse various date formats and return ISO YYYY-MM-DD."""
    formats = [
        '%d/%m/%Y', '%d-%m-%Y', '%d.%m.%Y',
        '%d/%m/%y', '%d-%m-%y', '%d.%m.%y',
        '%Y/%m/%d', '%Y-%m-%d',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return date_str  # Return as-is if parsing fails


# ---------------------------------------------------------------------------
# 5. COLUMN HEADER DETECTION
# ---------------------------------------------------------------------------
def detect_column_map(table_blocks: list[dict], learned_map: dict = None) -> dict:
    """
    Find the table column header row and build a column position map.
    Returns {x_position_bucket: standard_field_name}
    Also returns the detected header row index so we can skip it in item parsing.
    """
    if not table_blocks:
        return {}

    col_map = {}
    found_header = False
    header_y_max = 0

    # Anchor the heading band on its Product/Particulars label. OCR can place
    # neighbouring labels 20px apart, while the first item may start 27px below.
    name_headings = [b for b in table_blocks if any(word in b['text'].lower()
                     for word in ('product name', 'product', 'medicine', 'particulars', 'description', 'drug name', 'item name'))]
    for heading in sorted(name_headings, key=lambda b: b['y']):
        row_blocks = [b for b in table_blocks if abs(b['y'] - heading['y']) <= 22]
        row_text = ' '.join(block['text'] for block in row_blocks).lower()
        score = 0
        for block in row_blocks:
            key = block['text'].lower().strip().rstrip('.:')
            # Check exact match or substring match first
            if key in COLUMN_SYNONYM_MAP or any(k in key for k in COLUMN_SYNONYM_MAP):
                score += 1
                continue
            # Fallback to fuzzy matching for OCR typos like 'PRODUC!' or 'BAICH'
            for k in COLUMN_SYNONYM_MAP:
                if SequenceMatcher(None, key, k).ratio() > 0.75:
                    score += 1
                    break
                    
        # Use one header row; later rows must never add product values as column labels.
        if score >= 2:
            found_header = True
            for block in row_blocks:
                header_y_max = max(header_y_max, block['y'])
                key = block['text'].lower().strip().rstrip('.:')
                
                # Try exact match first
                standard = COLUMN_SYNONYM_MAP.get(key)
                # Then try partial match
                if not standard:
                    for synonym, field in COLUMN_SYNONYM_MAP.items():
                        if synonym in key or key in synonym:
                            standard = field
                            break
                # Then try fuzzy match
                if not standard:
                    for synonym, field in COLUMN_SYNONYM_MAP.items():
                        if SequenceMatcher(None, key, synonym).ratio() > 0.75:
                            standard = field
                            break
                # Apply learned overrides (distributor-specific)
                if learned_map and key in learned_map:
                    standard = learned_map[key]

                if standard:
                    x_bucket = round(block['x'] / 30) * 30  # 30px bucket
                    col_map[x_bucket] = standard
            break

    if not found_header:
        logger.warning("Column header row not found; using learned map or defaults")
        return {'col_map': learned_map or {}, 'header_y_max': 0, 'header_text': ''}

    # If OCR completely missed the 'QTY' text block, interpolate its position
    if 'qty' not in col_map.values():
        left_bucket = None
        for k, v in col_map.items():
            if v in ('expiry', 'pack_size', 'batch_no'):
                if left_bucket is None or k > left_bucket:
                    left_bucket = k
                    
        right_bucket = None
        for k, v in col_map.items():
            if v in ('free_qty', 'rate', 'mrp'):
                if right_bucket is None or k < right_bucket:
                    right_bucket = k
                    
        if left_bucket and right_bucket and right_bucket > left_bucket + 60:
            qty_bucket = round(((left_bucket + right_bucket) / 2) / 30) * 30
            col_map[qty_bucket] = 'qty'
            logger.info(f"Interpolated missing 'qty' bucket at {qty_bucket}")

    return {'col_map': col_map, 'header_y_max': header_y_max, 'header_text': row_text}


def _group_into_rows(blocks: list[dict], row_threshold: int = 15) -> list[list[dict]]:
    """Group OCR blocks into horizontal rows based on Y-coordinate proximity."""
    if not blocks:
        return []

    rows = []
    current_row = [blocks[0]]
    current_y = blocks[0]['y']

    for block in blocks[1:]:
        if abs(block['y'] - current_y) <= row_threshold:
            current_row.append(block)
        else:
            rows.append(sorted(current_row, key=lambda b: b['x']))
            current_row = [block]
            current_y = block['y']

    if current_row:
        rows.append(sorted(current_row, key=lambda b: b['x']))

    return rows


# ---------------------------------------------------------------------------
# 6. LINE ITEM EXTRACTION
# ---------------------------------------------------------------------------
def _ocr_cell_number(value):
    """Read a single OCR numeric cell without merging neighbouring columns."""
    cleaned = str(value).replace(',', '').replace('₹', '').strip().strip(" .:;()'\"")
    if re.fullmatch(r'[+-]?\d+(?:\.\d+)?', cleaned):
        return float(cleaned)
    return None


def extract_line_items(table_blocks: list[dict], col_map_result: dict) -> list[dict]:
    """
    Extract product line items from the table zone using the column position map.
    Returns list of dicts with standard field names.
    """
    if not col_map_result or not col_map_result.get('col_map'):
        return []

    col_map = col_map_result['col_map']
    header_y_max = col_map_result.get('header_y_max', 0)
    header_text = col_map_result.get('header_text', '').lower()
    anchors = {field: max(int(x) for x, mapped in col_map.items() if mapped == field)
               for field in set(col_map.values())}
    product_right = anchors.get('pack_size') or anchors.get('mrp') or float('inf')
    rate_x = anchors.get('rate', 0)

    footer_markers = [b['y'] for b in table_blocks if b['y'] > header_y_max and (
        re.search(r'\b(?:SUB\s*TOTAL|GRAND\s*TOTAL|TOTAL\s*QTY|TOTALQTY|BANK|BALDAT|BALAMT|GST\s*PAY|NET\s*PAY|RUPEES|RECEIVER|AUTHORI[ZS]ED)\b', b['text'].upper())
        or ('GST' in b['text'].upper() and 'SGST' in b['text'].upper())
    )]
    footer_y = min(footer_markers, default=float('inf'))
    valid_blocks = [b for b in table_blocks if header_y_max + 8 < b['y'] < footer_y]

    # Product names are more stable row anchors than OCR Y coordinates of the
    # far-right amounts. Assign each cell to the nearest product row.
    name_candidates = sorted(
        [b for b in valid_blocks if b['x'] < product_right
         and len(re.findall(r'[A-Za-z]', b['text'])) >= 2],
        key=lambda b: b['y'],
    )
    name_groups = _group_into_rows(name_candidates, row_threshold=12)
    row_centres = [sum(b['y'] for b in group) / len(group) for group in name_groups]
    rows = [[] for _ in row_centres]
    for block in valid_blocks:
        if row_centres:
            closest = min(range(len(row_centres)), key=lambda i: (abs(block['y'] - row_centres[i]), -i))
            if abs(block['y'] - row_centres[closest]) <= 20:
                rows[closest].append(block)
    rows = [sorted(row, key=lambda b: b['x']) for row in rows]

    items = []
    current_item = {}

    for row_blocks in rows:
        row_text = ' '.join(b['text'] for b in row_blocks).upper()
        if re.search(r'\b(?:SUB\s*TOTAL|GRAND\s*TOTAL|TOTAL\s*QTY|TOTALQTY|BANK|BALDAT|BALAMT|GST\s*PAY|NET\s*PAY|RUPEES|RECEIVER|AUTHORI[ZS]ED)\b', row_text) or ('GST' in row_text and 'SGST' in row_text):
            logger.info("Reached invoice footer after %s item rows", len(items) + bool(current_item))
            break
        if any(kw in row_text for kw in ['SUBTOTAL', 'ROUND OFF', 'GST0', 'GST 5', 'GST12', 'GST 18']):
            continue
        # Skip rows with no numeric content (likely sub-headers)
        if not any(re.search(r'\d', b['text']) for b in row_blocks):
            logger.info(f"Skipping non-numeric row: {row_text[:50]}")
            continue

        item = {}
        for block in row_blocks:
            x_bucket = round(block['x'] / 30) * 30
            # Find closest column in map (allow up to 600px drift for high-res images)
            matched_field = None
            closest_dist = 600
            for col_x, field in col_map.items():
                col_x_int = int(col_x) # Handle string keys from DB
                dist = abs(x_bucket - col_x_int)
                if dist < closest_dist:
                    # Prevent short margin codes (like 'KEP' or 'LRAP') from matching 'name'
                    # If it's a long product name, its left edge might drift > 200px.
                    # But a short string drifting > 200px is not the product name.
                    if field == 'name' and dist > 200 and len(block['text']) < 6:
                        continue
                    closest_dist = dist
                    matched_field = field

            if matched_field:
                existing = item.get(matched_field, '')
                # For name field, concatenate multi-block text
                if matched_field == 'name' and existing:
                    item[matched_field] = f"{existing} {block['text']}"
                else:
                    item[matched_field] = block['text'].strip()
            else:
                # Unmatched column — store as extra for review
                item[f'_col_{x_bucket}'] = block['text'].strip()

        # OCR often merges "Qty+free Product Name" into one heading. Locate the
        # actual text cells rather than using that heading's left edge as name.
        name_blocks = [b for b in row_blocks
                       if b['x'] < product_right and len(re.findall(r'[A-Za-z]', b['text'])) >= 2]
        item.pop('name', None)
        if name_blocks:
            item['name'] = ' '.join(b['text'].strip() for b in sorted(name_blocks, key=lambda b: b['x']))
            name_x = min(b['x'] for b in name_blocks)
            qty_blocks = [b for b in row_blocks if b['x'] < name_x]
            for block in qty_blocks:
                qty_match = re.search(r'(\d+)\s*\+\s*(\d*)', block['text'])
                if qty_match:
                    item['qty'] = qty_match.group(1)
                    item['free_qty'] = qty_match.group(2) or '0'
                    break

            hsn_blocks = [b for b in row_blocks
                          if name_x < b['x'] < anchors.get('mrp', float('inf'))
                          and re.fullmatch(r'\d{6,8}', b['text'].strip())]
            if hsn_blocks:
                item['hsn_code'] = hsn_blocks[-1]['text'].strip()

            expiry_blocks = [b for b in row_blocks
                             if name_x < b['x'] < anchors.get('mrp', float('inf'))
                             and re.fullmatch(r'(?:\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}(?:-\d{2})?)', b['text'].strip())]
            if expiry_blocks:
                item['expiry'] = expiry_blocks[0]['text'].strip()
            else:
                item.pop('expiry', None)

            numeric_tail = [(b['x'], number) for b in row_blocks
                            if b['x'] > rate_x and (number := _ocr_cell_number(b['text'])) is not None]
            if numeric_tail:
                numeric_tail.sort()
                amount_x, amount = numeric_tail[-1]
                item['amount'] = amount
                before_amount = [(x, n) for x, n in numeric_tail[:-1] if x < amount_x]
                if 'sgst' in header_text and 'cgst' in header_text and len(before_amount) >= 2:
                    tax_parts = [n for _, n in before_amount[-2:]]
                    if all(0 <= n <= 28 for n in tax_parts):
                        item['gst_pct'] = round(sum(tax_parts), 2)
                if 'dis' in header_text and before_amount:
                    discount = before_amount[0][1]
                    if 0 <= discount <= 100:
                        item['discount'] = discount

            # A printed HSN is not an expiry, and an item serial is not GST.
            if 'gst_pct' in item:
                gst_value = _ocr_cell_number(item['gst_pct'])
                if gst_value is None or not 0 <= gst_value <= 28:
                    item.pop('gst_pct', None)

        # Stateful merging for multi-line items (e.g., Name on L1, Batch/Rate on L2)
        if item.get('name'):
            # This is a new item! Push the previous one if it's valid.
            if current_item and current_item.get('name'):
                items.append(_clean_item(current_item))
            current_item = item
        else:
            # This row has no name, so it belongs to the previous item (if one exists).
            if current_item:
                for k, v in item.items():
                    if not current_item.get(k):
                        current_item[k] = v

    # Push the last item
    if current_item and current_item.get('name'):
        items.append(_clean_item(current_item))

    return items


def _clean_item(item: dict) -> dict:
    """Normalise and clean a parsed line item."""
    # Clean name
    if 'name' in item:
        item['name'] = re.sub(r'\s+', ' ', item['name']).strip()
        # Remove common HSN prefixes (4-8 digits) that get merged into the name block
        item['name'] = re.sub(r'^\d{4,8}\s*', '', item['name'])

    # Clean numeric fields
    for field in ['qty', 'free_qty', 'mrp', 'rate', 'discount', 'gst_pct', 'amount']:
        if field in item:
            clean = re.sub(r'[^\d.]', '', str(item[field]))
            try:
                item[field] = float(clean) if '.' in clean else int(clean)
            except (ValueError, TypeError):
                pass  # Leave as string for review screen to handle

    if 'pack_size' in item:
        pack = _ocr_cell_number(item['pack_size'])
        if pack is not None and pack > 0:
            item['pack_size'] = int(pack) if pack.is_integer() else pack

    # Normalise expiry date
    if 'expiry' in item:
        exp = item['expiry']
        # Handle MM/YY, MM-YY, MM.YY formats
        m = re.match(r'^(\d{1,2})[/\-.](\d{2,4})$', str(exp))
        if m:
            month, year = m.group(1), m.group(2)
            if len(year) == 2:
                year = f"20{year}"
            item['expiry'] = f"{year}-{month.zfill(2)}-01"  # First of month

    # Validation: check if amount ≈ qty × rate × (1 - disc/100)
    item['_validation_ok'] = _validate_item_math(item)

    return item


def _validate_item_math(item: dict) -> bool:
    """Cross-check line item math for the review screen confidence indicator."""
    try:
        qty = float(item.get('qty') or 0)
        rate = float(item.get('rate') or 0)
        disc = float(item.get('discount') or 0)
        amount = float(item.get('amount') or 0)
        if amount > 0 and rate > 0 and qty <= 0:
            return False
        if qty > 0 and rate > 0 and amount > 0:
            expected = qty * rate * (1 - disc / 100)
            tolerance = amount * 0.02  # 2% tolerance for rounding
            return abs(expected - amount) <= tolerance
    except (TypeError, ValueError, ZeroDivisionError):
        pass
    return True  # Default to OK if can't validate


# ---------------------------------------------------------------------------
# 7. FOOTER PARSER — Totals, GST breakdown
# ---------------------------------------------------------------------------
def parse_footer(footer_blocks: list[dict]) -> dict:
    """Extract grand total, CGST, SGST, IGST from the bottom zone."""
    lines = [b['text'] for b in footer_blocks]
    full_text = ' '.join(lines)

    totals = {
        'grand_total': None,
        'cgst': None,
        'sgst': None,
        'igst': None,
        'subtotal': None,
        'round_off': None,
    }

    # Extract amounts following keywords
    patterns = {
        'grand_total': r'(?:GRAND\s*TOTAL|NET\s*PAY(?:ABLE)?|NET\s*AMOUNT|TOTAL\s*AMOUNT)[:\s]*(?:RS\.?|₹)?\s*([\d,]+\.?\d*)',
        'cgst': r'CGST[:\s]+(?:RS\.?|₹)?\s*([\d,]+\.?\d*)',
        'sgst': r'SGST[:\s]+(?:RS\.?|₹)?\s*([\d,]+\.?\d*)',
        'igst': r'IGST[:\s]+(?:RS\.?|₹)?\s*([\d,]+\.?\d*)',
        'subtotal': r'(?:SUB\s*TOTAL|TAXABLE)[:\s]+(?:RS\.?|₹)?\s*([\d,]+\.?\d*)',
        'round_off': r'ROUND[:\s]+(?:RS\.?|₹)?\s*([+-]?[\d,.]+)',
    }

    for key, pattern in patterns.items():
        m = re.search(pattern, full_text, re.IGNORECASE)
        if m:
            try:
                totals[key] = float(m.group(1).replace(',', ''))
            except ValueError:
                pass

    return totals



# ---------------------------------------------------------------------------
# 8. DISTRIBUTOR MATCHING  (rules live in ocr_matching; this loads the data)
# ---------------------------------------------------------------------------
def _distributor_records(outlet_id) -> list:
    from apps.purchases.models import Distributor
    from apps.purchases.ocr_matching import DistributorRecord, dl_numbers, phone_set

    records = []
    rows = Distributor.objects.filter(outlet_id=outlet_id, is_active=True).only(
        'id', 'name', 'gstin', 'phone', 'mobile', 'dl_no_20b', 'dl_no_21b',
        'drug_license_no', 'ocr_aliases')
    for d in rows:
        learned = d.ocr_aliases if isinstance(d.ocr_aliases, dict) else {}
        records.append(DistributorRecord(
            id=str(d.id),
            name=d.name or '',
            gstin=(d.gstin or '').upper().strip(),
            phones=phone_set(d.phone, d.mobile),
            dl_numbers=dl_numbers(d.dl_no_20b, d.dl_no_21b, d.drug_license_no),
            learned_names=list(learned.get('names') or []),
            learned_gstins=list(learned.get('gstins') or []),
        ))
    return records


def match_distributor(outlet_id, header: dict) -> dict:
    """
    Returns {distributor_id, match_tier, confidence, is_new, matched_by}.
    GSTIN first, then names learned from earlier confirmed scans, then
    phone / DL, and a distinctive-name fuzzy match only when unambiguous.
    """
    from apps.purchases.ocr_matching import match_distributor_records

    result = match_distributor_records(header or {}, _distributor_records(outlet_id))
    result.pop('record', None)
    return result


def learn_distributor_alias(distributor, ocr_name: str = None, ocr_gstin: str = None,
                            buyer_name: str = None, buyer_gstin: str = None):
    """
    Remember how this distributor's name / GSTIN appeared on a confirmed scan.
    Never learns the pharmacy's own identity (outlet / buyer block): if the
    reader mixed up seller and buyer, learning it would send every later bill
    to this distributor.
    """
    from apps.purchases.ocr_matching import alias_key, distributor_name_similarity, normalize_gstin

    if distributor is None:
        return
    outlet = getattr(distributor, 'outlet', None)
    own_gstins = {g for g in ((getattr(outlet, 'gstin', '') or '').upper(), (buyer_gstin or '').upper()) if g}
    own_names = [n for n in (getattr(outlet, 'name', ''), buyer_name) if n]

    def is_own_name(name):
        return any(distributor_name_similarity(name, own) >= 0.85 for own in own_names)

    data = distributor.ocr_aliases if isinstance(distributor.ocr_aliases, dict) else {}
    names = list(data.get('names') or [])
    gstins = list(data.get('gstins') or [])
    changed = False

    key = alias_key(ocr_name or '')
    if key and key != alias_key(distributor.name) and key not in names and not is_own_name(ocr_name):
        names = ([key] + names)[:20]
        changed = True
    gstin, valid = normalize_gstin(ocr_gstin)
    if valid and gstin != (distributor.gstin or '').upper() and gstin not in gstins and gstin not in own_gstins:
        gstins = ([gstin] + gstins)[:5]
        changed = True
    if changed:
        distributor.ocr_aliases = {'names': names, 'gstins': gstins}
        distributor.save(update_fields=['ocr_aliases'])


# ---------------------------------------------------------------------------
# 9. MEDICINE MATCHING
# ---------------------------------------------------------------------------
_CATALOG_CACHE = {'sig': None, 'index': None, 'at': 0.0}
_CATALOG_TTL = 600  # seconds; also invalidated when products are added


def _catalog_index():
    """Tokenised MasterProduct catalogue, cached per worker process."""
    import time
    from django.db.models import Count, Max
    from apps.inventory.models import MasterProduct
    from apps.purchases.ocr_matching import CatalogProduct, ProductIndex, tokenize_product

    now = time.monotonic()
    # Re-check the catalogue for changes at most once a minute, not on every scan.
    if _CATALOG_CACHE['index'] is not None and now - _CATALOG_CACHE.get('checked', 0.0) < 60:
        return _CATALOG_CACHE['index']
    sig = tuple(MasterProduct.objects.aggregate(n=Count('id'), last=Max('created_at')).values())
    if _CATALOG_CACHE['index'] is not None and _CATALOG_CACHE['sig'] == sig \
            and now - _CATALOG_CACHE['at'] < _CATALOG_TTL:
        _CATALOG_CACHE['checked'] = now
        return _CATALOG_CACHE['index']

    rows = MasterProduct.objects.values_list(
        'id', 'name', 'manufacturer', 'hsn_code', 'gst_rate', 'pack_size', 'pack_unit',
        'mrp', 'is_discontinued')
    index = ProductIndex(
        CatalogProduct(
            id=str(pid), name=name or '', tokens=tokenize_product(name or ''),
            manufacturer=mfr or '', hsn_code=hsn,
            gst_rate=float(gst) if gst is not None else None,
            pack_size=pack, pack_unit=unit,
            mrp=float(mrp) if mrp else None, discontinued=bool(disc),
        )
        for pid, name, mfr, hsn, gst, pack, unit, mrp, disc in rows.iterator(chunk_size=5000)
    )
    _CATALOG_CACHE.update(sig=sig, index=index, at=now, checked=now)
    return index


def _product_context(outlet_id, distributor_id=None, batch_numbers=()):
    """
    Outlet / distributor history for tie-breaking. Kept small on purpose:
    one latest-MRP row per stocked product, and batch rows only for the batch
    numbers printed on this bill.
    """
    from django.db.models import Q
    from apps.inventory.models import Batch
    from apps.purchases.models import PurchaseItem
    from apps.purchases.ocr_matching import ProductContext, alias_key

    ctx = ProductContext()
    stocked = Batch.objects.filter(outlet_id=outlet_id, product_id__isnull=False)
    # Postgres DISTINCT ON: newest batch per product -> last MRP at this outlet.
    for pid, mrp in stocked.order_by('product_id', '-created_at').distinct('product_id') \
            .values_list('product_id', 'mrp').iterator(chunk_size=5000):
        pid = str(pid)
        ctx.outlet_product_ids.add(pid)
        if mrp:
            ctx.last_mrp[pid] = float(mrp)

    wanted = {b.strip() for b in batch_numbers if b and b.strip()}
    if wanted:
        q = Q()
        for b in list(wanted)[:60]:
            q |= Q(batch_no__iexact=b)
        for pid, batch_no in stocked.filter(q).values_list('product_id', 'batch_no'):
            ctx.batch_index.setdefault(alias_key(batch_no).replace(' ', ''), set()).add(str(pid))
    if distributor_id:
        ctx.distributor_product_ids = {
            str(pid) for pid in PurchaseItem.objects.filter(
                invoice__outlet_id=outlet_id, invoice__distributor_id=distributor_id,
                master_product_id__isnull=False,
            ).values_list('master_product_id', flat=True).distinct()
        }
    return ctx


def _product_payload(p, matched: bool, confidence: float, matched_by: str, suggestions=()) -> dict:
    return {
        'matched': matched,
        'confidence': round(float(confidence), 3),
        'matched_by': matched_by,
        'product_id': p.id if p else None,
        'product_name': p.name if p else None,
        'hsn_code': p.hsn_code if p else None,
        'gst_rate': p.gst_rate if p else None,
        'pack_size': p.pack_size if p else None,
        'pack_unit': p.pack_unit if p else None,
        'suggestions': [
            {'product_id': s.id, 'product_name': s.name, 'pack_size': s.pack_size,
             'pack_unit': s.pack_unit, 'hsn_code': s.hsn_code, 'gst_rate': s.gst_rate, 'mrp': s.mrp}
            for s in suggestions
        ],
    }


def build_product_matcher(outlet_id, distributor_id=None, batch_numbers=()):
    """
    Load catalogue, learned aliases and outlet history ONCE per invoice and
    return ``match(item_dict) -> match payload``.
    """
    from apps.inventory.models import MasterProductAlias
    from apps.purchases.ocr_matching import alias_key, decide_product, rank_products

    index = _catalog_index()
    ctx = _product_context(outlet_id, distributor_id, batch_numbers)
    aliases = {}
    for name, pid in MasterProductAlias.objects.filter(outlet_id=outlet_id) \
            .order_by('created_at').values_list('alias_name', 'product_id'):
        aliases[alias_key(name)] = str(pid)

    def match(item: dict) -> dict:
        name = item.get('name') or ''
        pid = aliases.get(alias_key(name))
        if pid and pid in index.by_id:
            return _product_payload(index.by_id[pid], True, 1.0, 'learned_alias')
        ranking = rank_products(name, index, ctx, batch_no=item.get('batch_no') or '',
                                mrp=item.get('mrp'), mfr=item.get('manufacturer') or '')
        pick, conf, suggestions = decide_product(ranking)
        if pick:
            return _product_payload(pick, True, conf, 'fuzzy', [s for s in suggestions if s.id != pick.id])
        out = _product_payload(None, False, conf, 'none', suggestions)
        out['product_name'] = name.upper().strip()
        return out

    return match


# ---------------------------------------------------------------------------
# 10. MAIN ENTRY POINT
# ---------------------------------------------------------------------------
class OCRProviderError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _outlet_identity(outlet_id):
    from apps.core.models import Outlet
    try:
        o = Outlet.objects.only('name', 'gstin').get(id=outlet_id)
        return o.name, (o.gstin or '').upper() or None
    except Exception:
        return None, None


# Problems with the photo itself: the local OCR fallback can't help either.
IMAGE_ERRORS = ('OCR_IMAGE_MISSING', 'OCR_IMAGE_UNREADABLE')


def _run_gemini(image_path, outlet_name, outlet_gstin, api_key):
    from PIL import UnidentifiedImageError
    from apps.purchases.gemini_ocr import extract_invoice
    try:
        return extract_invoice(image_path, api_key, outlet_name=outlet_name, outlet_gstin=outlet_gstin)
    except FileNotFoundError:
        raise OCRProviderError('OCR_IMAGE_MISSING')
    except UnidentifiedImageError:
        # e.g. a HEIC photo the phone did not convert to JPEG
        raise OCRProviderError('OCR_IMAGE_UNREADABLE')
    except Exception as exc:
        code = getattr(exc, 'code', None)
        logger.exception('Gemini extraction failed for %s', image_path)
        raise OCRProviderError('OCR_QUOTA_EXHAUSTED' if code == 429 else 'OCR_PROCESSING_FAILED')


def _run_local(image_path, outlet_gstin, outlet_id):
    blocks = extract_text_blocks(image_path)
    if not blocks:
        return None
    header_blocks, table_blocks, footer_blocks = split_zones(blocks)
    header = parse_header(header_blocks, all_blocks=blocks, outlet_gstin=outlet_gstin)
    dist_match = match_distributor(outlet_id, header)
    learned_col_map = {}
    if dist_match.get('distributor_id'):
        from apps.purchases.models import Distributor
        learned_col_map = Distributor.objects.filter(id=dist_match['distributor_id']) \
            .values_list('ocr_column_map', flat=True).first() or {}
    col_map_result = detect_column_map(blocks, learned_col_map)
    warnings = []
    if not col_map_result.get('col_map'):
        warnings.append('Could not detect table columns — manual entry required for line items')
    return {
        'header': header,
        'items': extract_line_items(blocks, col_map_result),
        'totals': parse_footer(footer_blocks),
        'warnings': warnings,
        'column_map': col_map_result.get('col_map', {}),
        'distributor_match': dist_match,
        'meta': {'engine': 'local'},
    }


def process_invoice_image(image_path, outlet_id: str) -> dict:
    """
    ``image_path`` is one path, or a list of paths (pages of ONE bill, in order).

    Full pipeline: image -> extraction (Gemini, or local RapidOCR when no key)
    -> distributor + medicine matching -> confidence.
    Called by the Celery task. Returns {header, items, totals,
    distributor_match, column_map, confidence, warnings, meta} or {error, ...}.
    """
    def fail(code, warnings=()):
        return {'error': code, 'header': {}, 'items': [], 'totals': {}, 'distributor_match': {},
                'confidence': 0, 'warnings': list(warnings)}

    outlet_name, outlet_gstin = _outlet_identity(outlet_id)
    api_key = os.environ.get('GEMINI_API_KEY')
    try:
        extracted = None
        if api_key:
            try:
                extracted = _run_gemini(image_path, outlet_name, outlet_gstin, api_key)
            except OCRProviderError as exc:
                if exc.code in IMAGE_ERRORS or \
                        os.environ.get('OCR_LOCAL_FALLBACK', '').lower() not in ('1', 'true', 'yes'):
                    return fail(exc.code)
                logger.warning('Falling back to local OCR after %s', exc.code)
        if extracted is None:
            pages = image_path if isinstance(image_path, (list, tuple)) else [image_path]
            extracted = _run_local(pages[0], outlet_gstin, outlet_id)
            if extracted is not None and len(pages) > 1:
                extracted['warnings'].append(f'Only page 1 of {len(pages)} could be read automatically — '
                                             f'enter the rows from the other pages by hand.')
                extracted['missing_pages'] = len(pages) - 1
            if extracted is None:
                return fail('OCR_NO_TEXT', ['OCR returned no results'])

        header = extracted['header']
        items = extracted['items']
        totals = extracted['totals']
        warnings = list(extracted.get('warnings') or [])

        dist_match = extracted.get('distributor_match') or match_distributor(outlet_id, header)
        matcher = build_product_matcher(outlet_id, dist_match.get('distributor_id'),
                                        batch_numbers=[i.get('batch_no') or '' for i in items])
        for item in items:
            if item.get('name'):
                item['_medicine_match'] = matcher(item)

        bad_math = sum(1 for i in items if i.get('_validation_ok') is False)
        if bad_math:
            warnings.append(f'Check qty / rate / amount on {bad_math} line{"s" if bad_math > 1 else ""} '
                            f'(they do not add up on the bill as read).')

        meta = extracted.get('meta') or {}
        # Every problem the checks still see must reach the staff, not just the log.
        for issue in meta.get('unresolved_issues') or []:
            if not any(issue[:40] in w or w[:40] in issue for w in warnings):
                warnings.append(issue)
        if meta.get('strong_check_unavailable'):
            warnings.insert(0, "This bill looked doubtful and the automatic re-check could not run fully "
                               "(Gemini usage limit reached). Please compare every line with the paper bill "
                               "before saving.")
        needs_review = bool(meta.get('unresolved_issues') or meta.get('strong_check_unavailable') or bad_math
                            or extracted.get('missing_pages') or extracted.get('duplicate_rows'))
        logger.info('OCR done: engine=%s model=%s items=%d dist=%s tokens=%s ms=%s cached=%s',
                    meta.get('engine'), meta.get('model'), len(items), dist_match.get('matched_by'),
                    (meta.get('usage') or {}).get('total_tokens'), meta.get('total_ms'), meta.get('cached'))
        return {
            'header': header,
            'items': items,
            'totals': totals,
            'distributor_match': {
                'distributor_id': dist_match.get('distributor_id'),
                'match_tier': dist_match.get('match_tier'),
                'confidence': dist_match.get('confidence'),
                'is_new': dist_match.get('is_new'),
                'matched_by': dist_match.get('matched_by'),
            },
            'column_map': extracted.get('column_map', {}),
            'confidence': _calculate_confidence(header, items, totals, dist_match),
            'warnings': warnings,
            'needs_review': needs_review,
            'meta': meta,
        }

    except (ImportError, OSError):
        logger.exception('OCR engine is unavailable for %s', image_path)
        return fail('OCR_ENGINE_UNAVAILABLE')
    except Exception:
        logger.exception('OCR processing failed for %s', image_path)
        return fail('OCR_PROCESSING_FAILED')


def _calculate_confidence(header, items, totals, dist_match) -> float:
    """Overall 0..1 confidence: header fields, distributor, line maths, product matches, totals."""
    score = 0.0
    weight = 0.0

    for key, w in (('distributor_name', 1), ('invoice_no', 1), ('invoice_date', 1), ('gstin', 0.5)):
        weight += w
        if header.get(key):
            score += w

    weight += 1.5
    score += 1.5 * float(dist_match.get('confidence') or 0) if dist_match.get('distributor_id') else 0

    weight += 3
    if items:
        valid = sum(1 for i in items if i.get('_validation_ok', True))
        matched = sum(1 for i in items if (i.get('_medicine_match') or {}).get('matched'))
        score += 1.5 * valid / len(items) + 1.5 * matched / len(items)

    weight += 0.5
    if totals.get('grand_total'):
        score += 0.5

    return round(score / weight, 3) if weight else 0
