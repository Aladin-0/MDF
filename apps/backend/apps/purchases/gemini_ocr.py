"""
Gemini extraction for scanned purchase invoices.

One API call per bill:  prepare_image -> cache lookup -> Gemini -> normalise.
Matching against the catalogue happens in ocr_engine (shared with the local
OCR path). Functions here are Django-free except the optional cache, so they
can be benchmarked offline.

Quota / speed measures
* Image is EXIF-rotated, converted to grayscale, capped at MAX_SIDE px and
  re-encoded as JPEG before sending (3–4 MB phone photo -> ~300–500 KB) and
  sent inline (no separate Files-API upload call).
* Results are cached by image hash, so "Retry scan" or re-uploading the same
  photo costs no quota.
* Only transient errors (429/5xx/timeouts) are retried, at most twice, then
  one fallback model is tried. Bad-request errors are never retried.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import os
import re
import time
from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from apps.purchases.ocr_matching import alias_key, normalize_gstin

logger = logging.getLogger(__name__)

PROMPT_VERSION = 'v6'
# Cascade: every bill is read by the cheap first-pass model; only readings that
# fail their own consistency checks are re-read by the stronger verify model.
DEFAULT_MODEL = 'gemini-3.1-flash-lite'
DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
DEFAULT_VERIFY_MODEL = 'gemini-3.5-flash'
MAX_SIDE = 2400
JPEG_QUALITY = 85
REQUEST_TIMEOUT_MS = 90_000
CACHE_TTL = 60 * 60 * 24 * 30


def primary_model() -> str:
    return os.environ.get('GEMINI_OCR_MODEL') or DEFAULT_MODEL


def fallback_model() -> str:
    return os.environ.get('GEMINI_OCR_FALLBACK_MODEL', DEFAULT_FALLBACK_MODEL)


def verify_model() -> str:
    """Model for the second (verification) read — normally the strongest one."""
    return os.environ.get('GEMINI_OCR_VERIFY_MODEL') or DEFAULT_VERIFY_MODEL


# ---------------------------------------------------------------------------
# Response schema (what Gemini must return)
# ---------------------------------------------------------------------------

class GeminiLineItem(BaseModel):
    name: str = Field(description="Product name exactly as printed in the product/description column, "
                                  "including strength, variant and form (e.g. 'DOLO 650 TAB', 'PAN-D CAP', "
                                  "'APTAMIL GOLD-3 REFILL 400GM'). Do not correct, expand or translate.")
    manufacturer: Optional[str] = Field(None, description="MFG / company column as printed (e.g. 'USV', 'HEAL').")
    hsn_code: Optional[str] = None
    pack: Optional[str] = Field(None, description="PACK / PKG column exactly as printed, e.g. 10'S, 1*15, 15TAB, 200ML.")
    batch_no: Optional[str] = Field(None, description="Batch exactly as printed, keep letters vs digits as printed.")
    expiry: Optional[str] = Field(None, description="Expiry exactly as printed, e.g. 11/27, 03/2028, NOV-27.")
    qty: Optional[float] = Field(None, description="Billed quantity, excluding free.")
    free_qty: Optional[float] = Field(None, description="Free / scheme quantity; 0 if blank or '-'.")
    mrp: Optional[float] = None
    rate: Optional[float] = Field(None, description="Per-unit purchase rate the amount is computed from "
                                                    "(RATE / P.RATE / PTR / PTS / NET RATE). Never the MRP.")
    discount_pct: Optional[float] = Field(None, description="Line discount percent (DISC / DIS / D%).")
    gst_pct: Optional[float] = Field(None, description="GST percent of the line; SGST%+CGST% if split.")
    amount: Optional[float] = Field(None, description="Line amount as printed.")


class GeminiParty(BaseModel):
    name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = Field(None, description="PAN if printed separately (10 characters).")
    dl_no: Optional[str] = Field(None, description="Drug licence numbers as printed, e.g. '20B-218007, 21B-218009'.")
    phone: Optional[str] = Field(None, description="All phone / mobile numbers as printed.")
    address: Optional[str] = None


class GeminiHeader(BaseModel):
    seller: GeminiParty = Field(description="The business that ISSUED the invoice (distributor / wholesaler).")
    buyer: GeminiParty = Field(description="The party the invoice is billed to (our pharmacy).")
    invoice_no: Optional[str] = None
    invoice_date: Optional[str] = Field(None, description="Invoice date exactly as printed.")


class GeminiTotals(BaseModel):
    gross: Optional[float] = Field(None, description="Total of the line amounts BEFORE any bill-level discount "
                                                     "(GOODS VALUE / GROSS / TOT.AMT / TOTAL of the amount column).")
    discount: Optional[float] = Field(None, description="Bill-level discounts deducted after the lines "
                                                        "(DISC, CASH DISC, BILL DISCOUNT, SCHEME), summed.")
    taxable: Optional[float] = Field(None, description="Taxable value after discounts (TAXABLE / SUB TOTAL after discount).")
    cgst: Optional[float] = None
    sgst: Optional[float] = None
    igst: Optional[float] = None
    round_off: Optional[float] = None
    grand_total: Optional[float] = Field(None, description="Final invoice value (GRAND TOTAL / NET AMT), "
                                                           "before credit-note adjustments or outstanding balance.")
    brought_forward: Optional[float] = Field(None, description="'TOTAL B/F' carried from a previous page, if printed.")


class GeminiInvoice(BaseModel):
    printed_item_count: Optional[int] = Field(None, description="Item / line count printed on the bill "
                                                                "('No of items', 'Total Items'), if any.")
    printed_total_qty: Optional[float] = Field(None, description="Total quantity printed on the bill "
                                                                 "('TOTAL QTY', 'Total Qty'), if any.")
    printed_page_count: Optional[int] = Field(None, description="Total pages printed on the bill "
                                                                "('Page 1 of 3' -> 3), if any.")
    header: GeminiHeader
    items: List[GeminiLineItem]
    totals: GeminiTotals


PROMPT = """You extract data from a photo of an Indian pharmacy PURCHASE invoice (GST tax invoice from a medicine distributor / wholesaler).
The photo may be rotated 90/180 degrees, skewed, folded, low-contrast, blurred or speckled with dot-matrix noise, and may carry handwritten ticks, PO numbers, signatures and stamps. Read only PRINTED text; ignore handwriting.

SELLER vs BUYER
- seller = the business that ISSUED the invoice: the big name / logo in the header block (often top-left) and the name after "For ..." near the signature.
- buyer = the party billed: the block labelled M/s, To, Party Name, Bill To, Customer, Buyer.{buyer_hint}
- Read each from its own block. Never copy buyer details into seller. Seller and buyer may share a GSTIN (inter-branch transfer) — still read each from its own block.

LINE ITEMS — one entry per printed product row, top to bottom:
- Follow each row straight across; do not shift values between rows.
- Skip rows that are not products: totals, sub totals, "TOTAL B/F", "C/F", credit/debit note references (e.g. "Cr/Dr No ..."), scheme or remark lines, blank rows.
- qty = billed quantity; free_qty = FREE / F.QTY / SCH column of THAT row (0 only if blank, "-" or 0 is printed there). Free quantities are small numbers like 1, 2, 5 — look carefully at each row's FREE cell.
- rate = per-unit purchase rate the amount is calculated from (RATE, P.RATE, PTR, PTS, NET RATE). If PTR is 0 or blank, use PTS. Never MRP.
- discount_pct = line DISC % column; gst_pct = line GST %, or SGST% + CGST% when split.
- COPY digits exactly as printed. Never calculate, derive or "fix" a value — if the printed numbers do not agree with each other, still return them as printed. Rates and amounts usually have at most 2 decimals.
- Before answering, re-check that every value you put in a row was printed on that same row (same height across the page, or the same line when the photo is rotated).
- name, batch_no, expiry: exactly as printed. Distinguish O/0, I/1, S/5, B/8 by context (batch numbers are usually letters followed by digits).
- Use null for anything not printed or unreadable. Never invent values or rows.
"""


MULTI_PAGE = """
MULTI-PAGE BILL
- The {n} images are pages 1 to {n} of ONE invoice, in order.
- Read seller, buyer, invoice number and date from the first page.
- Read the product rows of every page, in page order, each row exactly once.
- Skip carried / brought forward lines (C/F, B/F, "Total carried forward").
- Take the totals from the last page; brought_forward = the B/F amount printed on the last page, if any.
"""


def build_prompt(outlet_name: Optional[str], outlet_gstin: Optional[str], pages: int = 1) -> str:
    hint = ''
    if outlet_name or outlet_gstin:
        hint = (f" The buyer is our pharmacy: {outlet_name or ''}"
                f"{f' (GSTIN {outlet_gstin})' if outlet_gstin else ''}.")
    prompt = PROMPT.replace('{buyer_hint}', hint)
    if pages > 1:
        prompt += MULTI_PAGE.replace('{n}', str(pages))
    return prompt


# ---------------------------------------------------------------------------
# Image preparation
# ---------------------------------------------------------------------------

def prepare_image(path: str, max_side: int = MAX_SIDE, quality: int = JPEG_QUALITY) -> tuple:
    """Return (bytes, mime_type, meta). PDFs are passed through untouched."""
    with open(path, 'rb') as fh:
        raw = fh.read()
    if raw[:5] == b'%PDF-':
        return raw, 'application/pdf', {'bytes': len(raw), 'pdf': True}

    from PIL import Image, ImageOps
    im = Image.open(io.BytesIO(raw))
    im = ImageOps.exif_transpose(im)
    orig = im.size
    im = im.convert('L')                      # printed invoices: colour adds bytes, not information
    rotation, orientation_info = 0, None
    if auto_rotate_enabled():
        # Most phone photos of bills arrive sideways; vision models mix up
        # table rows on sideways pages, so straighten before sending.
        from apps.purchases.orientation import detect_orientation, rotate_cw
        rotation, orientation_info = detect_orientation(im)
        im = rotate_cw(im, rotation)
    scale = max_side / float(max(im.size))
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=1)  # lifts faded thermal / carbon prints
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=quality, optimize=True)
    data = buf.getvalue()
    return data, 'image/jpeg', {'bytes': len(data), 'orig_size': orig, 'size': im.size, 'pdf': False,
                                'rotated_cw': rotation, 'orientation': orientation_info}


def auto_rotate_enabled() -> bool:
    return os.environ.get('OCR_AUTO_ROTATE', '1').lower() not in ('0', 'false', 'no')


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------

def _thinking_config(types, model: str):
    m = model.lower()
    if m.startswith('gemini-2.5'):
        return types.ThinkingConfig(thinking_budget=0 if 'lite' in m else 512)
    if m.startswith('gemini-3') or 'latest' in m:
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
    return None


def _is_transient(exc) -> bool:
    code = getattr(exc, 'code', None) or getattr(exc, 'status_code', None)
    if code in (408, 429, 500, 502, 503, 504):
        return True
    name = type(exc).__name__.lower()
    return any(k in name for k in ('timeout', 'connect', 'remoteprotocol'))


def _is_model_unavailable(exc) -> bool:
    code = getattr(exc, 'code', None)
    return code == 404 or (code == 400 and 'model' in str(exc).lower())


def max_quota_wait() -> float:
    """
    Seconds we are willing to wait for a per-minute quota window on the better
    model before using the fallback. Scans run in the background (the screen
    polls for ~3 minutes), so waiting beats a weaker reading.
    """
    try:
        return float(os.environ.get('OCR_MAX_QUOTA_WAIT', '60'))
    except ValueError:
        return 60.0


def _quota_retry_delay(exc) -> Optional[float]:
    """
    For a 429: seconds Google asks us to wait, or None when waiting is pointless
    (daily quota used up -> switch model instead of burning time).
    """
    if getattr(exc, 'code', None) != 429:
        return None
    msg = str(exc)
    if re.search(r'PerDay|per day|daily', msg, re.IGNORECASE):
        return None
    m = re.search(r"retry(?:Delay)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*s", msg, re.IGNORECASE)
    return float(m.group(1)) if m else 10.0


def call_gemini(image_bytes: bytes, mime: str, prompt: str, api_key: str,
                models: Optional[list] = None, client=None, high_res: bool = False) -> dict:
    """Run extraction; returns {'data': dict, 'model': str, 'usage': {...}, 'ms': int}."""
    from google import genai
    from google.genai import types

    client = client or genai.Client(api_key=api_key,
                                    http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS))
    models = [m for m in (models or [primary_model(), fallback_model()]) if m]
    # One image, or a list of (bytes, mime) pages of the same bill -> one request.
    images = image_bytes if isinstance(image_bytes, (list, tuple)) else [(image_bytes, mime)]
    parts = [types.Part.from_bytes(data=b, mime_type=m) for b, m in images]
    last_exc = None
    for model in dict.fromkeys(models):   # de-duplicated, ordered
        cfg = types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema=GeminiInvoice,
            temperature=0.0,
            thinking_config=_thinking_config(types, model),
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH if high_res else None,
        )
        for attempt in range(3):
            t0 = time.monotonic()
            try:
                resp = client.models.generate_content(model=model, contents=[*parts, prompt], config=cfg)
                text = resp.text or ''
                data = json.loads(text)
                um = getattr(resp, 'usage_metadata', None)
                usage = {
                    'input_tokens': getattr(um, 'prompt_token_count', None),
                    'output_tokens': getattr(um, 'candidates_token_count', None),
                    'thinking_tokens': getattr(um, 'thoughts_token_count', None),
                    'total_tokens': getattr(um, 'total_token_count', None),
                }
                return {'data': data, 'model': model, 'usage': usage,
                        'ms': int((time.monotonic() - t0) * 1000)}
            except json.JSONDecodeError as exc:
                last_exc = exc
                logger.warning('Gemini %s returned invalid JSON (attempt %s)', model, attempt + 1)
                if attempt >= 1:
                    break
            except Exception as exc:  # google.genai.errors.APIError, httpx errors, ...
                last_exc = exc
                if _is_model_unavailable(exc):
                    logger.warning('Gemini model %s unavailable: %s', model, exc)
                    break
                if getattr(exc, 'code', None) == 429:
                    # Each model has its own quota: wait once for a short
                    # per-minute window, otherwise move to the next model.
                    delay = _quota_retry_delay(exc)
                    if delay is None or delay > max_quota_wait() or attempt >= 1:
                        logger.warning('Gemini %s quota exhausted; trying next model', model)
                        break
                    logger.info('Gemini %s rate-limited; waiting %.0fs', model, delay)
                    time.sleep(delay + 1)
                    continue
                if not _is_transient(exc) or attempt == 2:
                    logger.warning('Gemini %s failed: %s', model, exc)
                    break
                delay = 2 * (2 ** attempt)
                logger.info('Gemini %s transient error (%s); retrying in %ss', model, exc, delay)
                time.sleep(delay)
    raise last_exc or RuntimeError('Gemini extraction failed')


# ---------------------------------------------------------------------------
# Normalisation (pure)
# ---------------------------------------------------------------------------

_MONTHS = {m: i for i, m in enumerate(
    ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], 1)}


def _year(y: int) -> int:
    return y + 2000 if y < 100 else y


def parse_invoice_date(raw: Optional[str], today: Optional[date] = None) -> Optional[str]:
    """Indian invoices print D/M/Y. Returns ISO date or None."""
    if not raw:
        return None
    s = str(raw).strip().upper()
    today = today or date.today()
    m = re.search(r'(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = re.search(r'(\d{1,2})[-/. ]([A-Z]{3})[A-Z]*[-/. ,]*(\d{2,4})', s)
        if m and m.group(2) in _MONTHS:
            d, mo, y = int(m.group(1)), _MONTHS[m.group(2)], _year(int(m.group(3)))
        else:
            m = re.search(r'(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})', s)
            if not m:
                return None
            a, b, y = int(m.group(1)), int(m.group(2)), _year(int(m.group(3)))
            d, mo = (a, b) if b <= 12 else (b, a)   # 09/28/2026 printed by US-locale software
    try:
        dt = date(y, mo, d)
    except ValueError:
        return None
    if abs((dt - today).days) > 3 * 366:
        return None
    return dt.isoformat()


def normalize_expiry(raw: Optional[str]) -> Optional[str]:
    """MM/YY, MM/YYYY, MMM-YY, YYYY-MM(-DD) -> YYYY-MM-01."""
    if not raw:
        return None
    s = str(raw).strip().upper()
    m = re.match(r'^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$', s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
    else:
        m = re.match(r'^([A-Z]{3})[A-Z]*[-/. ]*(\d{2,4})$', s)
        if m and m.group(1) in _MONTHS:
            mo, y = _MONTHS[m.group(1)], _year(int(m.group(2)))
        else:
            m = re.match(r'^(\d{1,2})\s*[-/.]\s*(\d{2}|\d{4})$', s)
            if not m:
                m = re.match(r'^(\d{2})(\d{2})$', s)       # 1127
            if not m:
                return None
            mo, y = int(m.group(1)), _year(int(m.group(2)))
    if not (1 <= mo <= 12 and 2000 <= y <= 2100):
        return None
    return f'{y}-{mo:02d}-01'


def parse_pack_size(pack: Optional[str]) -> Optional[int]:
    """'10'S' -> 10, '1*15' -> 15, '15TAB' -> 15, '200ML' -> None (volume, not a count)."""
    if not pack:
        return None
    s = str(pack).upper().replace(' ', '')
    m = re.match(r'^(\d+)[X\*](\d+)(\D*)$', s)
    if m:
        n, k, unit = int(m.group(1)), int(m.group(2)), m.group(3)
        if n == 1:
            return k                      # 1X10 -> 10
        if re.match(r'^(ML|GM|G|MG|L|LTR|KG)', unit):
            return n                      # 12X4ML -> 12 vials
        return None                       # 10X10: box vs strip is ambiguous; product master decides
    if re.search(r'(ML|GM|G|KG|L|MG|LTR)$', s):
        return None
    m = re.match(r"^(\d+)('?S|TAB|TABS|CAP|CAPS|N|NOS)?$", s)
    if m and 0 < int(m.group(1)) <= 1000:
        return int(m.group(1))
    return None


def _num(v) -> Optional[float]:
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(re.sub(r'[^\d.\-]', '', str(v)))
    except ValueError:
        return None


def check_line_math(item: dict) -> tuple:
    """(ok, note). Amount may be printed before or after GST."""
    qty, rate, amount = _num(item.get('qty')), _num(item.get('rate')), _num(item.get('amount'))
    if not (qty and rate and amount):
        return True, None
    disc = _num(item.get('discount')) or 0.0
    gst = _num(item.get('gst_pct')) or 0.0
    base = qty * rate * (1 - disc / 100.0)
    for expected in (base, base * (1 + gst / 100.0), qty * rate):
        if abs(expected - amount) <= max(1.0, 0.015 * amount):
            return True, None
    return False, f'qty {qty:g} x rate {rate:g} does not match amount {amount:g}'


def totals_reconcile(line_sum: float, totals: dict) -> bool:
    """
    Bills print line amounts as gross, taxable or net-of-GST depending on the
    software, so accept a match against any of the printed totals.
    Returns True when there is nothing to compare against.
    """
    gross = totals.get('subtotal')
    disc = totals.get('discount') or 0
    tax = sum(totals.get(k) or 0 for k in ('cgst', 'sgst', 'igst'))
    grand = totals.get('grand_total')
    refs = [gross, totals.get('taxable'), grand]
    if gross:
        refs += [gross - disc, gross + tax, gross - disc + tax]
    if grand:
        refs.append(grand - (totals.get('round_off') or 0))
    refs = [r for r in refs if r]
    if not refs or not line_sum:
        return True
    if any(abs(line_sum - r) <= max(2.0, 0.01 * r) for r in refs):
        return True
    # Subtotal printed after a bill discount that wasn't itemised: footer is
    # self-consistent (subtotal + tax = grand total) and lines exceed the
    # subtotal by a discount-sized margin.
    if gross and grand and tax and abs(gross + tax - grand) <= 2.0 \
            and 0 < line_sum - gross <= 0.12 * line_sum:
        return True
    return False


def normalize_extraction(data: dict, outlet_gstin: Optional[str] = None, pages: int = 1) -> dict:
    """Map Gemini JSON to the pipeline's flat header / items / totals shape."""
    hdr = data.get('header') or {}
    seller = hdr.get('seller') or {}
    buyer = hdr.get('buyer') or {}
    warnings = []

    gstin, gstin_ok = normalize_gstin(seller.get('gstin'), seller.get('pan'))
    buyer_gstin, _ = normalize_gstin(buyer.get('gstin'), buyer.get('pan'))
    if gstin and not gstin_ok:
        warnings.append(f'Distributor GSTIN {gstin} failed the checksum — please verify.')

    dl = seller.get('dl_no') or ''
    dl20 = re.search(r'20\s*-?\s*B?\s*[-:/]?\s*([A-Z0-9/-]*\d{4,}[A-Z0-9/-]*)', dl.upper())
    dl21 = re.search(r'21\s*-?\s*B?\s*[-:/]?\s*([A-Z0-9/-]*\d{4,}[A-Z0-9/-]*)', dl.upper())

    header = {
        'distributor_name': (seller.get('name') or '').strip() or None,
        'gstin': gstin,
        'gstin_valid': gstin_ok,
        'phone': seller.get('phone'),
        'dl_no': dl or None,
        'dl_20b': dl20.group(1) if dl20 else None,
        'dl_21b': dl21.group(1) if dl21 else None,
        'address': seller.get('address'),
        'invoice_no': (hdr.get('invoice_no') or '').strip() or None,
        'invoice_date': parse_invoice_date(hdr.get('invoice_date')),
        'invoice_date_raw': hdr.get('invoice_date'),
        'state_code': gstin[:2] if gstin_ok else None,
        'buyer_name': buyer.get('name'),
        'buyer_gstin': buyer_gstin,
    }
    if outlet_gstin and gstin and gstin == outlet_gstin.upper() and buyer_gstin and buyer_gstin != gstin:
        warnings.append('The distributor GSTIN read from the bill is your own GSTIN — please verify the distributor.')
    header = {k: v for k, v in header.items() if v not in (None, '')}

    items = []
    for raw in data.get('items') or []:
        name = (raw.get('name') or '').strip()
        if not name or re.match(r'^(TOTAL|SUB\s*TOTAL|B/?F|C/?F|CR/?DR|CREDIT NOTE)', name.upper()):
            continue
        item = {
            'name': name,
            'manufacturer': raw.get('manufacturer'),
            'hsn_code': re.sub(r'\D', '', str(raw.get('hsn_code') or '')) or None,
            'pack': raw.get('pack'),
            'pack_size': parse_pack_size(raw.get('pack')),
            'batch_no': (str(raw.get('batch_no') or '').strip().upper() or None),
            'expiry': normalize_expiry(raw.get('expiry')),
            'expiry_raw': raw.get('expiry'),
            'qty': _num(raw.get('qty')),
            'free_qty': _num(raw.get('free_qty')) or 0,
            'mrp': _num(raw.get('mrp')),
            'rate': _num(raw.get('rate')),
            'discount': _num(raw.get('discount_pct')) or 0,
            'gst_pct': _num(raw.get('gst_pct')),
            'amount': _num(raw.get('amount')),
        }
        ok, note = check_line_math(item)
        item['_validation_ok'] = ok
        if note:
            item['_validation_note'] = note
        items.append({k: v for k, v in item.items() if v is not None})

    t = data.get('totals') or {}
    totals = {
        'subtotal': _num(t.get('gross')),
        'discount': _num(t.get('discount')),
        'taxable': _num(t.get('taxable')),
        'cgst': _num(t.get('cgst')),
        'sgst': _num(t.get('sgst')),
        'igst': _num(t.get('igst')),
        'round_off': _num(t.get('round_off')),
        'grand_total': _num(t.get('grand_total')),
        'brought_forward': _num(t.get('brought_forward')),
    }
    totals = {k: v for k, v in totals.items() if v is not None}

    bf = totals.get('brought_forward') or 0
    rows_sum = sum(_num(i.get('amount')) or 0 for i in items)
    # With every page scanned the rows already include the B/F part; a lone
    # later page needs the printed B/F added to reach the bill total.
    if items and not (totals_reconcile(rows_sum, totals) or (bf and totals_reconcile(rows_sum + bf, totals))):
        ref = totals.get('subtotal') or totals.get('grand_total')
        shown = rows_sum + (bf if pages == 1 else 0)
        if ref:
            warnings.append(f'Line amounts add up to {shown:.2f} but the bill total is {ref:.2f} — '
                            f'a row may be missing or misread.')

    printed_pages = data.get('printed_page_count')
    missing_pages = printed_pages - pages if isinstance(printed_pages, int) and printed_pages > pages else 0
    if missing_pages:
        # Rows of unscanned pages are absent, so a total mismatch is expected
        # and a re-read can't fix it — only the missing-page message applies.
        warnings = [w for w in warnings if 'add up' not in w]
        warnings.append(f'The bill says it has {printed_pages} pages but {pages} '
                        f'{"was" if pages == 1 else "were"} scanned — scan all pages of the bill together.')
    elif bf and pages == 1:
        warnings.append('This page continues from a previous page (TOTAL B/F) — scan all pages of the bill together.')

    duplicate_rows = 0
    if pages > 1:
        seen, dupes = set(), []
        for i in items:
            key = (alias_key(i.get('name', '')), i.get('batch_no'), i.get('qty'), i.get('amount'))
            if key in seen:
                dupes.append(i.get('name', ''))
            seen.add(key)
        duplicate_rows = len(dupes)
        if dupes:
            warnings.append('These rows appear twice — check whether the same page was scanned twice: '
                            + ', '.join(dupes[:5]) + '.')
    return {'header': header, 'items': items, 'totals': totals, 'warnings': warnings,
            'missing_pages': missing_pages, 'duplicate_rows': duplicate_rows}


def find_issues(data: dict, normalized: dict) -> list:
    """
    Signals that a reading is unreliable and worth one verification pass.
    Each entry is a plain sentence that is fed back to the model.
    """
    issues = []
    items = normalized.get('items') or []
    for w in normalized.get('warnings') or []:
        if 'add up' in w:
            issues.append(w.replace(' — a row may be missing or misread.', '.'))
    invented = [i['name'] for i in items
                if i.get('rate') is not None and abs(i['rate'] * 100 - round(i['rate'] * 100)) > 1e-6]
    if invented:
        issues.append('These rates have more than 2 decimals, so they were probably calculated instead of read: '
                      + ', '.join(invented[:5]) + '.')
    bad_math = [i['name'] for i in items if i.get('_validation_ok') is False]
    if bad_math:
        issues.append('On these rows qty x rate x (1 - discount%) does not equal the amount, so a value '
                      'or the discount was misread: ' + ', '.join(bad_math[:5]) + '.')
    over_mrp = [i['name'] for i in items
                if i.get('rate') and i.get('mrp') and i['rate'] > i['mrp'] * 1.001]
    if over_mrp:
        issues.append('Purchase rate is higher than MRP (impossible) on: ' + ', '.join(over_mrp[:5])
                      + ' — the MRP or rate was misread.')
    hdr = normalized.get('header') or {}
    if hdr.get('gstin') and not hdr.get('gstin_valid'):
        issues.append(f"The seller GSTIN read as {hdr['gstin']} is not a valid GSTIN — read it again character by "
                      f"character (the PAN printed nearby is characters 3-12 of the GSTIN).")
    printed = data.get('printed_item_count')
    if isinstance(printed, int) and printed > 0 and printed != len(items):
        issues.append(f'The bill says it has {printed} items but {len(items)} rows were read.')
    total_qty = _num(data.get('printed_total_qty'))
    if total_qty and items:
        billed = sum(_num(i.get('qty')) or 0 for i in items)
        free = sum(_num(i.get('free_qty')) or 0 for i in items)
        if all(abs(total_qty - v) > 0.01 for v in (billed, billed + free)):
            issues.append(f'The bill prints TOTAL QTY {total_qty:g} but the rows add up to {billed:g} '
                          f'(+{free:g} free) — check the QTY and FREE columns.')
    if items:
        incomplete = [i['name'] for i in items if not (i.get('qty') and i.get('amount'))]
        if len(incomplete) > max(1, len(items) // 3):
            issues.append('Quantity or amount is missing on: ' + ', '.join(incomplete[:5]) + '.')
    elif not data.get('items'):
        issues.append('No product rows were read.')
    return issues


def _issue_score(issues: list) -> int:
    return len(issues)


VERIFY_SUFFIX = """
A previous reading of this same photo had these problems:
{issues}
Read the whole table again from scratch, row by row, following each row straight across. Copy every value exactly as printed on that row."""


def verification_enabled() -> bool:
    return os.environ.get('OCR_VERIFY_PASS', '1').lower() not in ('0', 'false', 'no')


# ---------------------------------------------------------------------------
# Cache + entry point
# ---------------------------------------------------------------------------

def _cache():
    try:
        from django.core.cache import cache
        return cache
    except Exception:
        return None


def extract_invoice(image_path, api_key: str, outlet_name: Optional[str] = None,
                    outlet_gstin: Optional[str] = None, use_cache: bool = True) -> dict:
    """
    Image(s) -> normalised {header, items, totals, warnings, meta}.
    ``image_path`` is one path or a list of paths (pages of ONE bill, in
    order); all pages are straightened and read together in one request.
    No catalogue matching here.
    """
    t0 = time.monotonic()
    paths = list(image_path) if isinstance(image_path, (list, tuple)) else [image_path]
    prepared = [prepare_image(p) for p in paths]
    pages = len(prepared)
    if pages == 1:
        image_bytes, mime, img_meta = prepared[0]
    else:
        image_bytes, mime, img_meta = [(b, m) for b, m, _ in prepared], None, prepared[0][2]
    prompt = build_prompt(outlet_name, outlet_gstin, pages=pages)
    digest = hashlib.sha256(b''.join(b for b, _, _ in prepared) + prompt.encode()).hexdigest()
    key = f'ocr:gemini:{PROMPT_VERSION}:{digest}'

    cache = _cache() if use_cache else None
    cached = None
    if cache is not None:
        try:
            cached = cache.get(key)
        except Exception:
            logger.warning('OCR cache unavailable', exc_info=True)
            cache = None
    if cached:
        result = cached
        from_cache = True
    else:
        result = _extract_with_verification(image_bytes, mime, prompt, api_key, outlet_gstin, pages=pages)
        from_cache = False
        # Don't cache a reading made without the stronger check — a retry
        # after the quota resets should get the full verification.
        if cache is not None and not result.get('strong_check_unavailable'):
            try:
                cache.set(key, result, CACHE_TTL)
            except Exception:
                logger.warning('Could not cache OCR result', exc_info=True)

    out = normalize_extraction(result['data'], outlet_gstin, pages=pages)
    remaining = find_issues(result['data'], out)
    out['meta'] = {
        'engine': 'gemini',
        'model': result.get('model'),
        'prompt_version': PROMPT_VERSION,
        'usage': result.get('usage'),
        'api_ms': result.get('ms'),
        'total_ms': int((time.monotonic() - t0) * 1000),
        'cached': from_cache,
        'image': img_meta,
        'pages': pages,
        'pages_meta': [m for _, _, m in prepared] if pages > 1 else None,
        'passes': result.get('passes', 1),
        'pass_usage': result.get('pass_usage') or [{'model': result.get('model'), **(result.get('usage') or {})}],
        'unresolved_issues': remaining,
        'strong_check_unavailable': bool(result.get('strong_check_unavailable')),
    }
    return out


def _extract_with_verification(image_bytes, mime, prompt, api_key, outlet_gstin, pages: int = 1) -> dict:
    """
    First pass on the (already straightened) photo. Only when the reading
    fails its own consistency checks: re-read at high media resolution with
    the concrete problems named. Keep the
    better of the two readings. Clean bills cost exactly one request.
    """
    first = call_gemini(image_bytes, mime, prompt, api_key)
    first['passes'] = 1
    if not verification_enabled() or mime == 'application/pdf':
        return first
    issues = find_issues(first['data'], normalize_extraction(first['data'], outlet_gstin, pages=pages))
    if not issues:
        return first

    logger.info('OCR verification pass: %s', issues)
    try:
        second = call_gemini(image_bytes, mime,
                             prompt + VERIFY_SUFFIX.format(issues='\n'.join(f'- {i}' for i in issues)),
                             api_key, models=[verify_model(), primary_model()], high_res=True)
    except Exception:
        logger.warning('OCR verification pass failed; keeping first reading', exc_info=True)
        return {**first, 'strong_check_unavailable': True, 'first_pass_issues': issues}
    issues2 = find_issues(second['data'], normalize_extraction(second['data'], outlet_gstin, pages=pages))
    usage = {k: (first['usage'].get(k) or 0) + (second['usage'].get(k) or 0) for k in first['usage']}
    best = second if _issue_score(issues2) <= _issue_score(issues) else first
    # The stronger model was out of quota (e.g. free-tier daily limit) and the
    # re-read fell back to the basic model: staff must review this bill.
    strong_unavailable = second.get('model') != verify_model()
    return {**best, 'usage': usage, 'ms': first['ms'] + second['ms'], 'passes': 2,
            'strong_check_unavailable': strong_unavailable,
            'first_pass_model': first['model'], 'first_pass_issues': issues,
            'pass_usage': [{'model': first['model'], **first['usage']},
                           {'model': second['model'], **second['usage']}]}
