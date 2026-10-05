"""
Scan Purchase — OCR Engine
==========================
Handles end-to-end invoice image processing:
  1. Image preprocessing  (OpenCV: deskew, binarize, denoise)
  2. OCR text extraction  (RapidOCR)
  3. Zone-based parsing   (header / item-table / footer)
  4. 3-tier distributor matching (name → GSTIN → phone/DL)
  5. Dynamic column-header detection & line-item extraction

Usage (called from Celery task):
    from apps.purchases.ocr_engine import process_invoice_image
    result = process_invoice_image(image_path, outlet_id)
"""

import re
import os
import logging
from datetime import datetime

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
    "pack": "pack_size", "packing": "pack_size", "size": "pack_size",
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
    import numpy as np
    import cv2
    """
    Run RapidOCR on the preprocessed image.
    Returns list of {text, x, y, w, h, confidence} dicts sorted top→bottom left→right.
    """
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

    except Exception as e:
        logger.error(f"OCR extraction failed: {e}")
        return []


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

    rows = _group_into_rows(table_blocks, row_threshold=60)
    col_map = {}
    found_header = False
    header_y_max = 0

    for row_idx, row_blocks in enumerate(rows):
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
                    
        # If this row looks like a header row (at least 2 matches), accumulate its mappings
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
        elif found_header:
            # We already accumulated the header row(s). A score < 2 means we hit the actual items.
            # Break now so we don't accidentally accumulate fake headers from the footer.
            break

    if not found_header:
        logger.warning("Column header row not found; using learned map or defaults")
        return {'col_map': learned_map or {}, 'header_y_max': 0}

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

    return {'col_map': col_map, 'header_y_max': header_y_max}


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
def extract_line_items(table_blocks: list[dict], col_map_result: dict) -> list[dict]:
    """
    Extract product line items from the table zone using the column position map.
    Returns list of dicts with standard field names.
    """
    if not col_map_result or not col_map_result.get('col_map'):
        return []

    col_map = col_map_result['col_map']
    header_y_max = col_map_result.get('header_y_max', 0)

    # CRITICAL: Ignore any blocks that are vertically at or above the headers
    # This prevents the distributor name / address / phone from bleeding into items
    valid_blocks = [b for b in table_blocks if b['y'] > header_y_max + 10]

    rows = _group_into_rows(valid_blocks)

    items = []
    current_item = {}

    for row_idx, row_blocks in enumerate(rows):
        # We no longer skip the header row because 2-line items sometimes merge with the header
        # Instead, we rely on the numeric checks below to filter out pure header rows.

        # Skip rows that look like subtotals / section headers
        row_text = ' '.join(b['text'] for b in row_blocks).upper()
        if any(kw in row_text for kw in ['TOTAL', 'SUBTOTAL', 'SGST', 'CGST', 'IGST', 'ROUND', 'NET PAY', 'RUPEES', 'GST0', 'GST 5', 'GST12', 'GST 18', 'STORE', 'UBIN']):
            logger.info(f"Skipping subtotal/footer row: {row_text[:50]}")
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

        # Fallback: if 'name' is missing but 'hsn_code' is present and contains letters, it's likely a merged block
        if not item.get('name') and item.get('hsn_code'):
            if re.search(r'[A-Za-z]', item['hsn_code']):
                item['name'] = item['hsn_code']

        # Stateful merging for multi-line items (e.g., Name on L1, Batch/Rate on L2)
        if item.get('name'):
            # This is a new item! Push the previous one if it's valid.
            if current_item and (current_item.get('name') or current_item.get('qty')):
                items.append(_clean_item(current_item))
            current_item = item
        else:
            # This row has no name, so it belongs to the previous item (if one exists).
            if current_item:
                for k, v in item.items():
                    if not current_item.get(k):
                        current_item[k] = v

    # Push the last item
    if current_item and (current_item.get('name') or current_item.get('qty')):
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
    for field in ['qty', 'free_qty', 'mrp', 'rate', 'discount', 'gst_pct', 'amount', 'pack_size']:
        if field in item:
            clean = re.sub(r'[^\d.]', '', item[field])
            try:
                item[field] = float(clean) if '.' in clean else int(clean)
            except (ValueError, TypeError):
                pass  # Leave as string for review screen to handle

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
        qty = float(item.get('qty', 0))
        rate = float(item.get('rate', 0))
        disc = float(item.get('discount', 0))
        amount = float(item.get('amount', 0))
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
# 8. 3-TIER DISTRIBUTOR MATCHER
# ---------------------------------------------------------------------------
def match_distributor(outlet_id, header: dict) -> dict:
    """
    Attempt to match the scanned invoice's distributor against existing DB suppliers.
    Returns {distributor_id, match_tier, confidence, is_new}
    """
    # Lazy import to avoid circular imports at module load time
    from apps.purchases.models import Distributor

    distributors = list(Distributor.objects.filter(outlet_id=outlet_id, is_active=True))
    if not distributors:
        return {'distributor_id': None, 'match_tier': None, 'confidence': 0, 'is_new': True}

    ocr_name = (header.get('distributor_name') or '').upper().strip()
    ocr_gstin = (header.get('gstin') or '').upper().strip()
    ocr_phone = (header.get('mobile') or header.get('phone') or '').strip()
    ocr_dl_20b = (header.get('dl_20b') or '').strip()
    ocr_dl_21b = (header.get('dl_21b') or '').strip()

    # --- TIER 1: Fuzzy Name Match ---
    if ocr_name:
        best_match = None
        best_ratio = 0
        for dist in distributors:
            ratio = _fuzzy_ratio(ocr_name, dist.name.upper())
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = dist
        if best_ratio >= 0.82 and best_match:
            return {
                'distributor_id': str(best_match.id),
                'match_tier': 1,
                'confidence': best_ratio,
                'is_new': False,
                'distributor': best_match,
            }

    # --- TIER 2: GSTIN Match ---
    if ocr_gstin:
        for dist in distributors:
            if dist.gstin and dist.gstin.upper() == ocr_gstin:
                return {
                    'distributor_id': str(dist.id),
                    'match_tier': 2,
                    'confidence': 1.0,
                    'is_new': False,
                    'distributor': dist,
                }

    # --- TIER 3: Phone / DL Number Match ---
    for dist in distributors:
        db_phones = set(filter(None, [dist.phone, dist.mobile]))
        db_dl20 = dist.dl_no_20b or ''
        db_dl21 = dist.dl_no_21b or ''

        if ocr_phone and ocr_phone in db_phones:
            return {
                'distributor_id': str(dist.id),
                'match_tier': 3,
                'confidence': 0.9,
                'is_new': False,
                'distributor': dist,
            }
        if ocr_dl_20b and ocr_dl_20b and ocr_dl_20b in db_dl20:
            return {
                'distributor_id': str(dist.id),
                'match_tier': 3,
                'confidence': 0.85,
                'is_new': False,
                'distributor': dist,
            }
        if ocr_dl_21b and ocr_dl_21b and ocr_dl_21b in db_dl21:
            return {
                'distributor_id': str(dist.id),
                'match_tier': 3,
                'confidence': 0.85,
                'is_new': False,
                'distributor': dist,
            }

    # No match found
    return {'distributor_id': None, 'match_tier': None, 'confidence': 0, 'is_new': True}


def _fuzzy_ratio(a: str, b: str) -> float:
    """Fuzzy ratio between two strings using RapidFuzz."""
    from rapidfuzz import fuzz
    a = re.sub(r'[^A-Z0-9 ]', '', a)
    b = re.sub(r'[^A-Z0-9 ]', '', b)
    # Return 0.0 to 1.0 to match previous SequenceMatcher API
    return fuzz.token_sort_ratio(a, b) / 100.0


# ---------------------------------------------------------------------------
# 9. MEDICINE MATCHER
# ---------------------------------------------------------------------------
def match_medicine(product_name: str, outlet_id) -> dict:
    """
    Match extracted product name against MasterProduct inventory.
    1. Exact match on MasterProductAlias (per-outlet learned aliases)
    2. Fuzzy match using RapidFuzz against global MasterProduct catalogue
    Returns {product_id, product_name, hsn_code, gst_rate, pack_size, matched, confidence}
    """
    from apps.inventory.models import MasterProduct, MasterProductAlias
    from rapidfuzz import fuzz

    clean_name = product_name.upper().strip()

    # --- TIER 1: Check Aliases (Memory) — MasterProductAlias is per-outlet via FK ---
    alias = MasterProductAlias.objects.filter(outlet_id=outlet_id, alias_name__iexact=clean_name).first()
    if alias:
        best_match = alias.product
        return {
            'matched': True,
            'confidence': 1.0,
            'product_id': str(best_match.id),
            'product_name': best_match.name,
            'hsn_code': best_match.hsn_code,
            'gst_rate': float(best_match.gst_rate),
            'pack_size': best_match.pack_size,
            'pack_unit': best_match.pack_unit,
        }

    # --- TIER 2: Smart Fuzzy Match against global MasterProduct catalogue ---
    # MasterProduct has no outlet_id — it is a shared global product catalogue
    products = list(MasterProduct.objects.values(
        'id', 'name', 'hsn_code', 'gst_rate', 'pack_size', 'pack_unit'
    ))

    best_match = None
    best_ratio = 0

    for product in products:
        # token_set_ratio handles unordered/partial word overlaps beautifully
        ratio = fuzz.token_set_ratio(clean_name, product['name'].upper()) / 100.0
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = product

    # Lower threshold slightly since token_set_ratio is more rigorous than SequenceMatcher
    if best_ratio >= 0.75 and best_match:
        return {
            'matched': True,
            'confidence': best_ratio,
            'product_id': str(best_match['id']),
            'product_name': best_match['name'],
            'hsn_code': best_match['hsn_code'],
            'gst_rate': float(best_match['gst_rate']),
            'pack_size': best_match['pack_size'],
            'pack_unit': best_match['pack_unit'],
        }

    return {
        'matched': False,
        'confidence': best_ratio,
        'product_id': None,
        'product_name': clean_name,
        'hsn_code': None,
        'gst_rate': None,
        'pack_size': None,
        'pack_unit': None,
    }


# ---------------------------------------------------------------------------
# 10. MAIN ENTRY POINT
# ---------------------------------------------------------------------------
def process_invoice_image(image_path: str, outlet_id: str) -> dict:
    """
    Full pipeline: image → OCR → parse → match → structured result.
    Called by the Celery task.

    Returns a dict with:
    {
        header: {...},
        items: [{...}, ...],
        totals: {...},
        distributor_match: {...},
        confidence: float,
        warnings: [...]
    }
    """
    warnings = []

    try:
        # Check if Gemini is enabled via API key
        import os
        gemini_api_key = os.environ.get('GEMINI_API_KEY')
        if gemini_api_key:
            from apps.purchases.gemini_ocr import process_with_gemini
            logger.info("GEMINI_API_KEY detected. Routing image to Gemini 1.5 Flash...")
            return process_with_gemini(
                image_path=image_path,
                outlet_id=outlet_id,
                api_key=gemini_api_key,
                match_distributor_fn=match_distributor,
                match_medicine_fn=match_medicine,
                calc_confidence_fn=_calculate_confidence
            )

        # Fallback to traditional OCR pipeline
        logger.info(f"Starting traditional OCR for image: {image_path}")
        blocks = extract_text_blocks(image_path)

        if not blocks:
            return {
                'error': 'No text extracted from image. Please retake the photo with better lighting.',
                'header': {}, 'items': [], 'totals': {}, 'distributor_match': {},
                'confidence': 0, 'warnings': ['OCR returned no results']
            }

        logger.info(f"OCR extracted {len(blocks)} text blocks")

        # Step 2: Zone split
        header_blocks, table_blocks, footer_blocks = split_zones(blocks)
        logger.info(f"Zones: {len(header_blocks)} header, {len(table_blocks)} table, {len(footer_blocks)} footer blocks")

        # Step 3: Parse header
        from apps.core.models import Outlet
        outlet_gstin = None
        try:
            outlet = Outlet.objects.get(id=outlet_id)
            outlet_gstin = outlet.gstin
        except Exception:
            pass

        header = parse_header(header_blocks, all_blocks=blocks, outlet_gstin=outlet_gstin)
        logger.info(f"Header parsed: {header}")

        # Step 4: 3-tier distributor match
        dist_match = match_distributor(outlet_id, header)
        logger.info(f"Distributor match: tier={dist_match.get('match_tier')}, new={dist_match.get('is_new')}")

        # Get learned column map for this distributor (if known)
        learned_col_map = {}
        if dist_match.get('distributor'):
            learned_col_map = dist_match['distributor'].ocr_column_map or {}

        # Step 5: Detect column layout
        col_map_result = detect_column_map(blocks, learned_col_map)
        if not col_map_result:
            warnings.append("Could not detect table columns — manual entry required for line items")

        # Step 6: Extract line items
        items = extract_line_items(blocks, col_map_result)
        logger.info(f"Extracted {len(items)} line items")

        # Step 7: Match each item against medicine inventory
        for item in items:
            if item.get('name'):
                med_match = match_medicine(item['name'], outlet_id)
                item['_medicine_match'] = med_match
                if not med_match['matched']:
                    warnings.append(f"Medicine not found in inventory: {item['name']}")

        # Step 8: Parse footer totals
        totals = parse_footer(footer_blocks)
        logger.info(f"Footer totals: {totals}")

        # Step 9: Calculate overall confidence
        confidence = _calculate_confidence(header, items, totals, dist_match)

        return {
            'header': header,
            'items': items,
            'totals': totals,
            'distributor_match': {
                'distributor_id': dist_match.get('distributor_id'),
                'match_tier': dist_match.get('match_tier'),
                'confidence': dist_match.get('confidence'),
                'is_new': dist_match.get('is_new'),
            },
            'column_map': col_map_result.get('col_map', {}),
            'confidence': confidence,
            'warnings': warnings,
        }

    except Exception as e:
        logger.exception(f"OCR processing failed for {image_path}: {e}")
        return {
            'error': str(e),
            'header': {}, 'items': [], 'totals': {}, 'distributor_match': {},
            'confidence': 0, 'warnings': [f'Processing error: {str(e)}']
        }


def _calculate_confidence(header, items, totals, dist_match) -> float:
    """Compute an overall OCR confidence score between 0 and 1."""
    score = 0
    weight = 0

    # Header fields
    if header.get('distributor_name'): score += 1
    if header.get('invoice_no'): score += 1
    if header.get('invoice_date'): score += 1
    if header.get('gstin'): score += 0.5
    weight += 3.5

    # Distributor match
    if dist_match.get('match_tier') == 1: score += 1.5
    elif dist_match.get('match_tier') == 2: score += 1.2
    elif dist_match.get('match_tier') == 3: score += 1.0
    weight += 1.5

    # Items
    if items:
        valid_items = sum(1 for i in items if i.get('_validation_ok'))
        score += (valid_items / len(items)) * 2
    weight += 2

    # Totals
    if totals.get('grand_total'): score += 0.5
    weight += 0.5

    return round(score / weight, 3) if weight > 0 else 0
