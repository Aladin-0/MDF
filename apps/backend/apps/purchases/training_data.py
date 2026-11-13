"""
Training data for a future in-house bill reader (no Google API needed).

Every scanned bill that staff confirm is a perfectly labelled example:
  * ocr_result  — what the AI read (all fields, per row)
  * confirmed   — what staff finally saved (the correct answer)
  * corrections — exactly which fields staff had to change
  * image_files — optional training copies of the (straightened) page photos

Recording never blocks or changes saving a purchase. Export everything with
`python manage.py export_scan_training --out <folder>`.

Photos: the big original scan photos are still deleted 24 h after scanning.
For CONFIRMED bills only, a small compressed training copy is kept (grayscale,
long side TRAINING_MAX_SIDE px, JPEG quality TRAINING_JPEG_QUALITY, ~100-150 KB
per page) under ocr_training/, never touched by the 24 h clean-up. Turn off
with OCR_KEEP_TRAINING_IMAGES=0.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime

logger = logging.getLogger(__name__)

ITEM_FIELDS = ('batch', 'expiry', 'qty', 'free', 'mrp', 'rate', 'discount', 'gst')
TRAINING_MAX_SIDE = 1600      # printed text stays clearly readable for training
TRAINING_JPEG_QUALITY = 70


def keep_training_images() -> bool:
    return os.environ.get('OCR_KEEP_TRAINING_IMAGES', '1').lower() not in ('0', 'false', 'no')


def compress_for_training(data: bytes) -> bytes:
    """Small grayscale JPEG copy (long side <= TRAINING_MAX_SIDE)."""
    import io
    from PIL import Image, ImageOps
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('L')
    scale = TRAINING_MAX_SIDE / float(max(im.size))
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=TRAINING_JPEG_QUALITY, optimize=True, progressive=True)
    return buf.getvalue()


def _num(v):
    try:
        return round(float(v), 2) if v not in (None, '') else None
    except (TypeError, ValueError):
        return None


def _day(v):
    """'2027-11-01', '2027-11-01T00:00:00Z', date -> '2027-11-01'."""
    if not v:
        return None
    if isinstance(v, (date, datetime)):
        return v.isoformat()[:10]
    return str(v)[:10]


def _key(v):
    import re
    return re.sub(r'[^A-Z0-9]', '', str(v or '').upper())


def ai_items(ocr: dict) -> list:
    """Rows as the AI read them, in a stable training shape."""
    out = []
    for it in (ocr or {}).get('items') or []:
        match = it.get('_medicine_match') or {}
        out.append({
            'name': it.get('name'),
            'manufacturer': it.get('manufacturer'),
            'hsn': it.get('hsn_code'),
            'pack': it.get('pack'),
            'batch': it.get('batch_no'),
            'expiry': _day(it.get('expiry')),
            'qty': _num(it.get('qty')),
            'free': _num(it.get('free_qty')) or 0,
            'mrp': _num(it.get('mrp')),
            'rate': _num(it.get('rate')),
            'discount': _num(it.get('discount')) or 0,
            'gst': _num(it.get('gst_pct')),
            'amount': _num(it.get('amount')),
            'row_text': it.get('row_text'),
            'page': it.get('page', 1),
            'box': it.get('box'),
            'product_id': match.get('product_id'),
            'product_name': match.get('product_name') if match.get('matched') else None,
            'match_confidence': match.get('confidence'),
        })
    return out


def confirmed_items(payload: dict) -> list:
    """Rows as staff saved them (the correct answer)."""
    from apps.inventory.models import MasterProduct
    rows = payload.get('items') or []
    ids = {str(r.get('masterProductId')) for r in rows if r.get('masterProductId')}
    names = {str(p.id): p.name for p in MasterProduct.objects.filter(id__in=ids).only('id', 'name')} if ids else {}
    out = []
    for r in rows:
        pid = str(r['masterProductId']) if r.get('masterProductId') else None
        out.append({
            'bill_name': r.get('ocrOriginalName'),
            'product_id': pid,
            'product_name': names.get(pid) or r.get('customProductName'),
            'hsn': r.get('hsnCode'),
            'pack': r.get('pkg'),
            'batch': r.get('batchNo'),
            'expiry': _day(r.get('expiryDate')),
            'qty': _num(r.get('qty')),
            'free': _num(r.get('freeQty')) or 0,
            'mrp': _num(r.get('mrp')),
            'rate': _num(r.get('purchaseRate')),
            'discount': _num(r.get('discountPct')) or 0,
            'gst': _num(r.get('gstRate')),
            'taxable': _num(r.get('taxableAmount')),
            'total': _num(r.get('totalAmount')),
        })
    return out


def diff(ai_header: dict, ai_dist_id, ai_rows: list, final_header: dict, final_rows: list) -> list:
    """Every field staff changed, plus rows they added or removed."""
    changes = []
    for field, a, f in (('distributor', ai_dist_id, final_header.get('distributor_id')),
                        ('invoice_no', ai_header.get('invoice_no'), final_header.get('invoice_no')),
                        ('invoice_date', _day(ai_header.get('invoice_date')), final_header.get('invoice_date'))):
        if (_key(a) if field == 'invoice_no' else a) != (_key(f) if field == 'invoice_no' else f):
            changes.append({'row': None, 'field': field, 'ai': a, 'final': f})

    # Pair saved rows with AI rows by the printed name staff kept (in order).
    unused = list(range(len(ai_rows)))
    for fi, fr in enumerate(final_rows):
        pair = next((ai for ai in unused if fr.get('bill_name') and ai_rows[ai]['name'] == fr['bill_name']), None)
        if pair is None:
            changes.append({'row': fi + 1, 'field': 'row_added', 'ai': None, 'final': fr.get('product_name')})
            continue
        unused.remove(pair)
        ar = ai_rows[pair]
        if ar.get('product_id') != fr.get('product_id'):
            changes.append({'row': fi + 1, 'field': 'product', 'ai': ar.get('product_name') or ar.get('name'),
                            'final': fr.get('product_name'), 'bill_name': fr.get('bill_name')})
        for field in ITEM_FIELDS:
            a, f = ar.get(field), fr.get(field)
            same = _key(a) == _key(f) if field == 'batch' else a == f
            if not same:
                changes.append({'row': fi + 1, 'field': field, 'ai': a, 'final': f, 'bill_name': fr.get('bill_name')})
    for ai in unused:
        changes.append({'row': None, 'field': 'row_removed', 'ai': ai_rows[ai].get('name'), 'final': None})
    return changes


def _copy_training_images(sample_id, purchase_invoice) -> list:
    """Small compressed copies of the (straightened) page photos in ocr_training/ — kept beyond the 24 h clean-up."""
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage
    files = [purchase_invoice.invoice_image] if purchase_invoice.invoice_image else []
    files += [p.image for p in purchase_invoice.extra_pages.all() if p.image]
    stamp = datetime.now().strftime('%Y/%m')
    saved = []
    for n, f in enumerate(files, start=1):
        try:
            with f.open('rb') as fh:
                small = compress_for_training(fh.read())
            name = default_storage.save(f'ocr_training/{stamp}/{sample_id}_p{n}.jpg', ContentFile(small))
            saved.append(name)
        except Exception:
            logger.warning('Could not store training copy of page %s for %s', n, sample_id, exc_info=True)
    return saved


def record_training_sample(draft, purchase_invoice, payload: dict):
    """Store one confirmed scan as a training sample. Never raises."""
    try:
        from apps.purchases.models import ScanTrainingSample
        ocr = draft.ocr_raw_data or {}
        if not ocr:
            return None
        ai_header = ocr.get('header') or {}
        ai_rows = ai_items(ocr)
        final_rows = confirmed_items(payload)
        dist = purchase_invoice.distributor
        final_header = {
            'distributor_id': str(dist.id) if dist else None,
            'distributor_name': dist.name if dist else None,
            'distributor_gstin': (dist.gstin if dist else None) or None,
            'invoice_no': payload.get('invoiceNo') or purchase_invoice.invoice_no,
            'invoice_date': _day(payload.get('invoiceDate') or purchase_invoice.invoice_date),
        }
        ai_dist_id = (ocr.get('distributor_match') or {}).get('distributor_id')
        changes = diff(ai_header, ai_dist_id, ai_rows, final_header, final_rows)
        meta = ocr.get('meta') or {}
        sample = ScanTrainingSample.objects.create(
            outlet_id=purchase_invoice.outlet_id,
            purchase_invoice=purchase_invoice,
            distributor=dist,
            ocr_result={'header': ai_header, 'items': ai_rows, 'totals': ocr.get('totals') or {},
                        'warnings': ocr.get('warnings') or [],
                        'meta': {k: meta.get(k) for k in ('model', 'prompt_version', 'passes', 'page_sizes',
                                                          'page_upright', 'pages')}},
            confirmed={'header': final_header, 'items': final_rows,
                       'totals': {'subtotal': _num(payload.get('subtotal')), 'discount': _num(payload.get('discountAmount')),
                                  'taxable': _num(payload.get('taxableAmount')), 'gst': _num(payload.get('gstAmount')),
                                  'grand_total': _num(payload.get('grandTotal'))}},
            corrections=changes,
            rows=len(final_rows),
            corrected_fields=len(changes),
            model_name=str(meta.get('model') or '')[:100],
            prompt_version=str(meta.get('prompt_version') or '')[:20],
        )
        if keep_training_images():
            files = _copy_training_images(sample.id, purchase_invoice)
            if files:
                ScanTrainingSample.objects.filter(pk=sample.pk).update(image_files=files)
        return sample
    except Exception:
        logger.warning('Could not record OCR training sample for %s', getattr(draft, 'id', '?'), exc_info=True)
        return None
