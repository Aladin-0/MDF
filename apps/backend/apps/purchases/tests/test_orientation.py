"""Orientation detection (needs rapidocr-onnxruntime; skipped if not installed)."""
import pytest

pytest.importorskip('rapidocr_onnxruntime')
from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from apps.purchases.orientation import detect_orientation, rotate_cw  # noqa: E402

pytestmark = pytest.mark.unit


def _invoice_like():
    im = Image.new('L', (1600, 1100), 255)
    d = ImageDraw.Draw(im)
    font = ImageFont.load_default(size=34)
    lines = ['SARDA ENTERPRISES GST TAX INVOICE', 'ISTAVEL 100 GTH2310A 06/28 175.00 4 133.34',
             'BECOSULES CAP 2623066N 11/27 68.60 12 54.87', 'ZERODOL P TAB KVB0126041AS 03/28 75.94',
             'OLMESAR 20 18261523A 03/30 224.43 3 170.99', 'TELMIKIND TAB 40MG 5K5Z048 03/28 62.27',
             'MET XL 50 GT09166 04/29 125.53 1 95.64', 'GOODS VALUE 3267.22 NET AMOUNT 3328.00']
    for i, line in enumerate(lines):
        d.text((60, 60 + i * 120), line, fill=0, font=font)
    return im


@pytest.mark.parametrize('turned_cw', [0, 90, 180, 270])
def test_detects_rotation(turned_cw):
    upright = _invoice_like()
    photo = rotate_cw(upright, turned_cw)
    fix, info = detect_orientation(photo)
    assert (turned_cw + fix) % 360 == 0, info


# --- per-row photo strips: snapping rows to their printed lines -------------------

def _bill_image():
    import io
    im = Image.new('L', (2000, 1100), 255)
    d = ImageDraw.Draw(im)
    f = ImageFont.load_default(size=30)
    d.text((60, 40), 'SR PRODUCT        BATCH        EXP   QTY FREE   MRP     RATE    AMOUNT', fill=0, font=f)
    rows = ['1 BECOSULES CAP   2623066N   11/27  12  2    68.60   54.87   658.44',
            '2 BECOSULES CAP   2623047N   10/27  11  0    68.60   54.87   603.57',
            '3 ZERODOL P TAB   KVB0126041AS 03/28 10 0   75.94   57.86   578.60']
    for k, r in enumerate(rows):
        d.text((60, 160 + k * 140), r, fill=0, font=f)
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=90)
    return buf.getvalue()


def test_rows_snap_to_their_own_printed_line():
    from apps.purchases.orientation import locate_rows
    items = [
        {'name': 'BECOSULES CAP', 'batch_no': '2623066N', 'mrp': 68.6, 'rate': 54.87, 'amount': 658.44},
        {'name': 'BECOSULES CAP', 'batch_no': '2623047N', 'mrp': 68.6, 'rate': 54.87, 'amount': 603.57},
        {'name': 'ZERODOL P TAB', 'batch_no': 'KVB0126041AS', 'mrp': 75.94, 'rate': 57.86, 'amount': 578.6},
    ]
    boxes = locate_rows(_bill_image(), items)
    # The guarantee: every strip is on its OWN printed line, or there is no strip.
    # Printed lines sit at y ~ 160, 300, 440 of 1100 -> ~ 160, 290, 420 of 1000.
    expected = (160, 290, 420)
    for box, want in zip(boxes, expected):
        if box is not None:
            assert abs((box[0] + box[2]) / 2 - want) < 40, boxes
    assert sum(b is not None for b in boxes) >= 2, boxes
    # the two BECOSULES rows (same name, different batch) are never put on each other's line
    assert boxes[1] is not None and abs((boxes[1][0] + boxes[1][2]) / 2 - 290) < 40


def test_row_that_is_not_on_the_bill_gets_no_strip():
    from apps.purchases.orientation import locate_rows
    boxes = locate_rows(_bill_image(), [{'name': 'AUGMENTIN 625 DUO', 'batch_no': 'ZZ99999', 'amount': 1234.56}])
    assert boxes == [None]


def test_snap_row_boxes_drops_boxes_it_cannot_trust():
    from apps.purchases.gemini_ocr import snap_row_boxes
    items = [{'name': 'ZERODOL P TAB', 'batch_no': 'KVB0126041AS', 'amount': 578.6, 'box': [10, 10, 30, 990], 'page': 1},
             {'name': 'NOT PRINTED', 'batch_no': 'QQ1', 'amount': 1.11, 'box': [40, 10, 60, 990], 'page': 1}]
    snap_row_boxes(items, [(_bill_image(), 'image/jpeg', {})], page_upright=[True])
    assert items[0]['box'] != [10, 10, 30, 990]            # replaced by the real printed line
    assert 'box' not in items[1]                           # no confident line -> no strip
    rows = [{'name': 'X', 'box': [1, 1, 50, 900], 'page': 1}]
    snap_row_boxes(rows, [(b'', 'image/jpeg', {})], page_upright=[False])
    assert 'box' not in rows[0]                            # stored photo doesn't match -> no strip
