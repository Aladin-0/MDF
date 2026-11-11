"""Pure tests for Gemini output normalisation (no API calls, no DB)."""
from datetime import date

import pytest

from apps.purchases.gemini_ocr import (
    _quota_retry_delay, check_line_math, normalize_expiry, normalize_extraction,
    parse_invoice_date, parse_pack_size,
)

pytestmark = pytest.mark.unit
TODAY = date(2026, 10, 3)


@pytest.mark.parametrize('raw,iso', [
    ('26-09-2026', '2026-09-26'),
    ('26/09/26', '2026-09-26'),
    ('13.09.2026', '2026-09-13'),
    ('2026-09-28', '2026-09-28'),
    ('09/28/2026', '2026-09-28'),      # US-locale billing software
    ('21-09-2026 16:36', '2026-09-21'),
    ('28 Sep 2026', '2026-09-28'),
    ('05/10/2026', '2026-10-05'),      # ambiguous -> Indian D/M/Y
    ('31/02/2026', None),
    ('', None),
    ('01/01/1999', None),              # far from today -> misread
])
def test_invoice_date(raw, iso):
    assert parse_invoice_date(raw, today=TODAY) == iso


@pytest.mark.parametrize('raw,iso', [
    ('11/27', '2027-11-01'), ('3/28', '2028-03-01'), ('03/2028', '2028-03-01'),
    ('NOV-27', '2027-11-01'), ('2028-05', '2028-05-01'), ('2028-05-01', '2028-05-01'),
    ('1127', '2027-11-01'), ('13/27', None), ('', None), ('-', None),
])
def test_expiry(raw, iso):
    assert normalize_expiry(raw) == iso


@pytest.mark.parametrize('raw,n', [
    ("10'S", 10), ('10S', 10), ('1*15', 15), ('1X10', 10), ('15TAB', 15), ('10TAB', 10),
    ('200ML', None), ('400GM', None), ('1S', 1), ('12X4ML', 12), ('10X10', None), (None, None),
])
def test_pack_size(raw, n):
    assert parse_pack_size(raw) == n


def test_line_math():
    assert check_line_math({'qty': 10, 'rate': 48.81, 'amount': 488.10})[0]
    assert check_line_math({'qty': 10, 'rate': 450, 'amount': 4500, 'gst_pct': 5})[0]
    assert check_line_math({'qty': 3, 'rate': 190.48, 'amount': 571.44})[0]
    assert check_line_math({'qty': 5, 'rate': 100, 'discount': 10, 'amount': 450})[0]
    assert check_line_math({'qty': 5, 'rate': 100, 'gst_pct': 12, 'amount': 560})[0]  # amount incl. GST
    ok, note = check_line_math({'qty': 8, 'rate': 48.81, 'amount': 488.10})        # 8 misread for 10
    assert not ok and 'does not match' in note
    assert check_line_math({'qty': None, 'rate': 1, 'amount': 1})[0]                 # nothing to check


def _gemini(**over):
    data = {
        'header': {
            'seller': {'name': 'BASANT MEDICAL AGENCIES', 'gstin': '27AACFB4442P1Z8',
                       'dl_no': '20B-226840, 21B-226842', 'phone': '0240 2325067'},
            'buyer': {'name': 'MANAVTA PHARMA PVT LTD SAI MEDICAL', 'gstin': '27AAPCM1753L2ZX'},
            'invoice_no': 'B2644490', 'invoice_date': '28/09/2026',
        },
        'items': [
            {'name': 'ARTHRACAL TAB', 'pack': '10S', 'batch_no': 'acmt2603', 'expiry': '11/27',
             'qty': 3, 'free_qty': None, 'mrp': 250, 'rate': 190.48, 'gst_pct': 5, 'amount': 571.44},
            {'name': 'Cr/Dr No.ZSR07844 Dt.28-Se', 'qty': None},
            {'name': 'TOTAL', 'amount': 4056.49},
            {'name': 'MAXOZA-L (NUTRA)', 'pack': '1S', 'batch_no': 'SIH0041A', 'expiry': '12/27',
             'qty': 30, 'mrp': 62, 'rate': 47.24, 'gst_pct': 5, 'amount': 1417.20},
        ],
        'totals': {'gross': 1988.64, 'cgst': 64.66, 'sgst': 64.66, 'grand_total': 2716},
    }
    data.update(over)
    return data


def test_normalize_maps_seller_and_skips_non_items():
    out = normalize_extraction(_gemini(), outlet_gstin='27AAPCM1753L2ZX')
    h = out['header']
    assert h['distributor_name'] == 'BASANT MEDICAL AGENCIES'
    assert h['gstin'] == '27AACFB4442P1Z8' and h['gstin_valid'] is True
    assert h['state_code'] == '27'
    assert h['invoice_date'] == '2026-09-28'
    assert h['dl_20b'] == '226840' and h['dl_21b'] == '226842'
    names = [i['name'] for i in out['items']]
    assert names == ['ARTHRACAL TAB', 'MAXOZA-L (NUTRA)']
    first = out['items'][0]
    assert first['batch_no'] == 'ACMT2603' and first['expiry'] == '2027-11-01'
    assert first['pack_size'] == 10 and first['free_qty'] == 0 and first['_validation_ok']


def test_normalize_flags_missing_rows_against_total():
    out = normalize_extraction(_gemini(totals={'gross': 9999.0}))
    assert any('add up' in w for w in out['warnings'])


def test_normalize_warns_when_seller_gstin_is_buyers():
    data = _gemini()
    data['header']['seller']['gstin'] = '27AAPCM1753L2ZX'
    data['header']['buyer']['gstin'] = '27AACFB4442P1Z8'
    out = normalize_extraction(data, outlet_gstin='27AAPCM1753L2ZX')
    assert any('your own GSTIN' in w for w in out['warnings'])


def test_quota_delay_parsing():
    class E(Exception):
        code = 429
    assert _quota_retry_delay(E("Please retry in 18.1s. 'retryDelay': '18s'")) == pytest.approx(18.1)
    assert _quota_retry_delay(E('Quota exceeded GenerateRequestsPerDayPerProjectPerModel')) is None

    class Other(Exception):
        code = 500
    assert _quota_retry_delay(Other('x')) is None


def test_totals_reconcile_variants():
    from apps.purchases.gemini_ocr import totals_reconcile
    # lines = gross
    assert totals_reconcile(6850.86, {'subtotal': 6850.86, 'grand_total': 7063})
    # lines printed incl. GST -> match net amount
    assert totals_reconcile(332.44, {'subtotal': 365.08, 'grand_total': 332.0, 'round_off': -0.44})
    # subtotal printed after an un-itemised bill discount (Shri Samarth bill)
    assert totals_reconcile(904.20, {'subtotal': 877.07, 'sgst': 21.92, 'cgst': 21.92, 'grand_total': 921.0})
    # a row really missing (Sarda bill, first reading)
    assert not totals_reconcile(2859.61, {'subtotal': 3267.22, 'sgst': 79.23, 'cgst': 79.23, 'grand_total': 3328})


def test_find_issues_flags_invented_rates_and_counts():
    from apps.purchases.gemini_ocr import find_issues
    data = {'printed_item_count': 7, 'items': [{}] * 7}
    norm = {'items': [
        {'name': 'ZERODOL P TAB', 'qty': 3, 'rate': 56.996, 'amount': 170.99},
        {'name': 'OLMESAR 20', 'qty': 10, 'rate': 51.297, 'amount': 512.97},
    ], 'warnings': ['Line amounts add up to 2859.61 but the bill total is 3267.22 — a row may be missing or misread.']}
    issues = find_issues(data, norm)
    assert any('add up' in i for i in issues)
    assert any('more than 2 decimals' in i and 'ZERODOL' in i for i in issues)
    assert any('says it has 7 items' in i for i in issues)
    clean = {'items': [{'name': 'A', 'qty': 10, 'rate': 48.81, 'amount': 488.10}], 'warnings': []}
    assert find_issues({'items': [{}]}, clean) == []


def test_find_issues_total_qty_catches_missed_free():
    from apps.purchases.gemini_ocr import find_issues
    norm = {'items': [{'name': 'A', 'qty': 12, 'free_qty': 0, 'rate': 1, 'amount': 12},
                      {'name': 'B', 'qty': 11, 'free_qty': 0, 'rate': 1, 'amount': 11}], 'warnings': []}
    assert any('TOTAL QTY' in i for i in find_issues({'printed_total_qty': 25}, norm))
    assert find_issues({'printed_total_qty': 23}, norm) == []


def test_find_issues_flags_line_maths():
    from apps.purchases.gemini_ocr import find_issues
    norm = {'items': [{'name': 'DUR CON', 'qty': 1, 'rate': 145, 'amount': 116, '_validation_ok': False}],
            'warnings': []}
    assert any('does not equal the amount' in i for i in find_issues({}, norm))


def _reading(rate=48.81, amount=488.10):
    return {'header': {'seller': {'name': 'ANIL MEDICAL STORES'}, 'buyer': {}},
            'items': [{'name': 'LACTOBRAIN', 'qty': 10, 'rate': rate, 'amount': amount}],
            'totals': {'gross': 488.10}}


def test_cascade_clean_bill_uses_one_cheap_read(monkeypatch):
    from apps.purchases import gemini_ocr as g
    calls = []

    def fake(img, mime, prompt, key, models=None, client=None, high_res=False):
        calls.append((models, high_res))
        return {'data': _reading(), 'model': 'cheap', 'usage': {'input_tokens': 1, 'output_tokens': 1}, 'ms': 1}
    monkeypatch.setattr(g, 'call_gemini', fake)
    out = g._extract_with_verification(b'x', 'image/jpeg', 'p', 'k', None)
    assert out['passes'] == 1 and len(calls) == 1


def test_cascade_flagged_bill_escalates_to_verify_model(monkeypatch):
    from apps.purchases import gemini_ocr as g
    monkeypatch.setenv('GEMINI_OCR_MODEL', 'cheap-model')
    monkeypatch.setenv('GEMINI_OCR_VERIFY_MODEL', 'strong-model')
    calls = []

    def fake(img, mime, prompt, key, models=None, client=None, high_res=False):
        calls.append((models, high_res))
        if len(calls) == 1:   # cheap read misreads qty -> line maths fails
            return {'data': _reading(rate=56.996, amount=170.99), 'model': 'cheap-model',
                    'usage': {'input_tokens': 1, 'output_tokens': 1}, 'ms': 1}
        return {'data': _reading(), 'model': 'strong-model', 'usage': {'input_tokens': 2, 'output_tokens': 2}, 'ms': 1}
    monkeypatch.setattr(g, 'call_gemini', fake)
    out = g._extract_with_verification(b'x', 'image/jpeg', 'p', 'k', None)
    assert out['passes'] == 2 and out['model'] == 'strong-model'
    assert calls[1] == (['strong-model', 'cheap-model'], True)
    assert [p['model'] for p in out['pass_usage']] == ['cheap-model', 'strong-model']


def test_find_issues_rate_above_mrp_and_bad_gstin():
    from apps.purchases.gemini_ocr import find_issues
    norm = {'items': [{'name': 'LOISTO FACE WASH', 'qty': 4, 'mrp': 57.0, 'rate': 174.24, 'amount': 696.96}],
            'warnings': [], 'header': {'gstin': '27APP9221A1ZC', 'gstin_valid': False}}
    issues = find_issues({}, norm)
    assert any('higher than MRP' in i for i in issues)
    assert any('not a valid GSTIN' in i for i in issues)


def test_strong_model_out_of_quota_marks_bill_for_review(monkeypatch):
    from apps.purchases import gemini_ocr as g
    monkeypatch.setenv('GEMINI_OCR_MODEL', 'cheap-model')
    monkeypatch.setenv('GEMINI_OCR_VERIFY_MODEL', 'strong-model')
    calls = []

    def fake(img, mime, prompt, key, models=None, client=None, high_res=False):
        calls.append(models)
        bad = len(calls) == 1
        # strong model's daily quota is gone -> call_gemini fell back to the cheap one
        return {'data': _reading(rate=56.996, amount=170.99) if bad else _reading(),
                'model': 'cheap-model', 'usage': {'input_tokens': 1, 'output_tokens': 1}, 'ms': 1}
    monkeypatch.setattr(g, 'call_gemini', fake)
    out = g._extract_with_verification(b'x', 'image/jpeg', 'p', 'k', None)
    assert out['strong_check_unavailable'] is True


def test_reading_without_strong_check_is_not_cached(monkeypatch, tmp_path):
    import io
    from PIL import Image
    from apps.purchases import gemini_ocr as g
    monkeypatch.setenv('OCR_AUTO_ROTATE', '0')
    img = tmp_path / 'bill.jpg'
    buf = io.BytesIO(); Image.new('L', (40, 30), 255).save(buf, format='JPEG'); img.write_bytes(buf.getvalue())
    store = {}

    class FakeCache:
        def get(self, k): return store.get(k)
        def set(self, k, v, t): store[k] = v
    monkeypatch.setattr(g, '_cache', lambda: FakeCache())
    monkeypatch.setattr(g, '_extract_with_verification', lambda *a, **k: {
        'data': _reading(), 'model': 'cheap-model', 'usage': {}, 'ms': 1, 'strong_check_unavailable': True})
    out = g.extract_invoice(str(img), 'k')
    assert out['meta']['strong_check_unavailable'] is True and store == {}


# --- multi-page bills --------------------------------------------------------

def _page_items(*rows):
    return [{'name': n, 'batch_no': b, 'qty': q, 'rate': r, 'amount': round(q * r, 2)} for n, b, q, r in rows]


def test_multipage_prompt_and_totals():
    from apps.purchases.gemini_ocr import build_prompt, normalize_extraction
    assert 'MULTI-PAGE' not in build_prompt('X', None)
    assert 'pages 1 to 3 of ONE invoice' in build_prompt('X', None, pages=3)
    data = {'header': {'seller': {'name': 'SHRI SAMARTH MEDICO'}, 'buyer': {}},
            'printed_page_count': 2,
            'items': _page_items(('IVERHEAL-12', 'TI49', 6, 26.4), ('MINOXYTOP', 'TM16', 5, 57.6),
                                 ('RISCAN-2', 'ST25', 3, 59.6)),
            # last page prints the B/F of page 1 and the grand total of all rows
            'totals': {'gross': 158.4 + 288.0 + 178.8, 'brought_forward': 158.4 + 288.0}}
    out = normalize_extraction(data, pages=2)
    assert out['missing_pages'] == 0 and out['duplicate_rows'] == 0
    assert not any('add up' in w or 'pages' in w for w in out['warnings'])


def test_missing_page_reported_without_total_noise():
    from apps.purchases.gemini_ocr import find_issues, normalize_extraction
    data = {'header': {'seller': {'name': 'S'}, 'buyer': {}}, 'printed_page_count': 3,
            'items': _page_items(('A', 'B1', 1, 10)), 'totals': {'gross': 500, 'brought_forward': 300}}
    out = normalize_extraction(data, pages=2)
    assert out['missing_pages'] == 1
    assert any('says it has 3 pages but 2 were scanned' in w for w in out['warnings'])
    assert not any('add up' in w for w in out['warnings'])
    assert find_issues(data, out) == []          # nothing a re-read could fix


def test_same_page_scanned_twice_is_flagged():
    from apps.purchases.gemini_ocr import normalize_extraction
    rows = _page_items(('DOLO 650', 'D1', 10, 25.0), ('PAN 40', 'P1', 5, 150.0))
    data = {'header': {'seller': {'name': 'S'}, 'buyer': {}}, 'items': rows + rows, 'totals': {}}
    out = normalize_extraction(data, pages=2)
    assert out['duplicate_rows'] == 2
    assert any('appear twice' in w for w in out['warnings'])


def test_extract_invoice_sends_all_pages_in_one_request(monkeypatch, tmp_path):
    import io
    from PIL import Image
    from apps.purchases import gemini_ocr as g
    monkeypatch.setenv('OCR_AUTO_ROTATE', '0')
    paths = []
    for n in range(2):
        p = tmp_path / f'p{n}.jpg'
        buf = io.BytesIO(); Image.new('L', (40 + n, 30), 255).save(buf, format='JPEG'); p.write_bytes(buf.getvalue())
        paths.append(str(p))
    seen = {}

    def fake(img, mime, prompt, key, models=None, client=None, high_res=False):
        seen['img'], seen['prompt'] = img, prompt
        return {'data': _reading(), 'model': 'm', 'usage': {}, 'ms': 1}
    monkeypatch.setattr(g, 'call_gemini', fake)
    out = g.extract_invoice(paths, 'k', use_cache=False)
    assert isinstance(seen['img'], list) and len(seen['img']) == 2
    assert 'pages 1 to 2 of ONE invoice' in seen['prompt']
    assert out['meta']['pages'] == 2
