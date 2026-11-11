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
