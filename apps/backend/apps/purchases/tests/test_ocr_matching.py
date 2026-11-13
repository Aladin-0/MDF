"""
Pure unit tests for OCR matching (no DB). Cases come from real distributor
bills where the old matcher picked the wrong medicine / distributor.
"""
import pytest

from apps.purchases.ocr_matching import (
    CatalogProduct, DistributorRecord, ProductContext, ProductIndex,
    alias_key, decide_product, distributor_name_similarity, gstin_checksum_ok,
    match_distributor_records, normalize_gstin, rank_products, tokenize_product,
)

pytestmark = pytest.mark.unit


def _catalog(*names, **extra):
    return ProductIndex(
        CatalogProduct(id=f'p{i}', name=n, tokens=tokenize_product(n), **extra)
        for i, n in enumerate(names)
    )


def _pick(name, index, ctx=None, **kw):
    pick, conf, sugg = decide_product(rank_products(name, index, ctx, **kw))
    return (pick.name if pick else None), conf, [s.name for s in sugg]


CATALOG = _catalog(
    'DOLO 500 TAB', 'DOLO 650 TAB', 'DOLO SYRUP',
    'PAN 40 TAB', 'PAN D CAP', 'PAN DSR CAP', 'PAN 20 TAB',
    'APTAMIL GOLD 1 TIN 400G', 'APTAMIL GOLD 3 REFILL 400G', 'APTAMIL GOLD 2 REFILL 400G',
    'ECOSPRIN 75 TAB', 'ECOSPRIN 150 TAB', 'ECOSPRIN GOLD 10 CAP', 'ECOSPRIN GOLD 20 CAP',
    'TELMIBROOK 40 TAB', 'TELMIBROOK H TAB', 'TELMIBROOK AM TAB',
    'RISCAN 2 TAB', 'TAMOXICAN 20 TAB', 'TAMOXICAN 10 TAB',
    'AUGMENTIN 625 DUO TAB', 'AUGMENTIN 375 TAB',
    'LACTOBRAIN SACHET 1G', 'NIVEA SHAVING CREAM',
)


# --- tokenizer ---------------------------------------------------------------

def test_tokenizer_strips_pack_and_keeps_strength():
    t = tokenize_product('ECOSPRIN GOLD-10MG. 1*15')
    assert t.core == ('ECOSPRIN', 'GOLD')
    assert t.strengths == {'10'}


def test_tokenizer_glued_strength_and_forms():
    t = tokenize_product("DOLO650 TABS 15'S")
    assert t.core == ('DOLO',)
    assert t.strengths == {'650'}
    assert t.forms == {'TAB'}


def test_tokenizer_drops_parenthetical_notes():
    assert tokenize_product('MAXOZA-L (NUTRA)').core == ('MAXOZA', 'L')


# --- strength / stage / variant guards --------------------------------------

@pytest.mark.parametrize('bill,expected', [
    ('DOLO 650 TABLET', 'DOLO 650 TAB'),
    ('DOLO-650', 'DOLO 650 TAB'),
    ('PAN 40', 'PAN 40 TAB'),
    ('PAN-D CAP', 'PAN D CAP'),
    ('PAN DSR', 'PAN DSR CAP'),
    ('APTAMIL GOLD-3 REFFIL 400GM', 'APTAMIL GOLD 3 REFILL 400G'),
    ('APTAMIL GOLD 1 TIN 400GM', 'APTAMIL GOLD 1 TIN 400G'),
    ('ECOSPRIN GOLD-10MG. 1*15', 'ECOSPRIN GOLD 10 CAP'),
    ('TELMIBROOK 40', 'TELMIBROOK 40 TAB'),
    ('TAMOXICAN-20', 'TAMOXICAN 20 TAB'),
    ('RISCAN-2', 'RISCAN 2 TAB'),
    ('LACTOBRAIN SACHETS 1GM', 'LACTOBRAIN SACHET 1G'),
])
def test_picks_exact_variant(bill, expected):
    pick, conf, _ = _pick(bill, CATALOG)
    assert pick == expected, (bill, pick, conf)


@pytest.mark.parametrize('bill', [
    'DOLO 1000 TAB',          # strength not in catalogue
    'PAN 80',                 # strength not in catalogue
    'APTAMIL GOLD 4 400GM',   # stage not in catalogue
    'TELMIBROOK',             # ambiguous: 40 / H / AM
    'SHAVING CREAM',          # generic subset of a branded item
])
def test_does_not_guess_when_ambiguous(bill):
    pick, conf, _ = _pick(bill, CATALOG)
    assert pick is None, (bill, pick, conf)


def test_ambiguous_returns_suggestions():
    pick, _, sugg = _pick('TELMIBROOK', CATALOG)
    assert pick is None
    assert set(sugg) & {'TELMIBROOK 40 TAB', 'TELMIBROOK H TAB', 'TELMIBROOK AM TAB'}


def test_ocr_typos_still_match():
    assert _pick('AUGMENTN 625 DUO', CATALOG)[0] == 'AUGMENTIN 625 DUO TAB'
    assert _pick('ECOSPRlN 75', CATALOG)[0] == 'ECOSPRIN 75 TAB'


# --- context tie-breakers ----------------------------------------------------

def test_batch_history_breaks_a_tie():
    idx = _catalog('ZINCOHEAL TAB', 'ZINCOHEAL SYRUP 200ML')
    ctx = ProductContext(batch_index={'PT260803': {'p0'}})
    assert _pick('ZINCOHEAL', idx)[0] is None
    assert _pick('ZINCOHEAL', idx, ctx, batch_no='PT260803')[0] == 'ZINCOHEAL TAB'


def test_mrp_breaks_a_tie():
    idx = ProductIndex([
        CatalogProduct('a', 'NAPROHEAL 500 TAB', tokenize_product('NAPROHEAL 500 TAB'), mrp=211.0),
        CatalogProduct('b', 'NAPROHEAL 500 SR TAB', tokenize_product('NAPROHEAL 500 SR TAB'), mrp=320.0),
    ])
    assert _pick('NAPROHEAL-500', idx, mrp=211.0)[0] == 'NAPROHEAL 500 TAB'


def test_only_outlet_mrp_history_settles_siblings():
    idx = ProductIndex([
        CatalogProduct('t40', 'TELMIBROOK 40 TAB', tokenize_product('TELMIBROOK 40 TAB'), mrp=120.0),
        CatalogProduct('th', 'TELMIBROOK H TAB', tokenize_product('TELMIBROOK H TAB'), mrp=140.0),
    ])
    # Catalogue MRP alone is not trusted to decide (often a stale placeholder) ...
    assert _pick('TELMIBROOK', idx, mrp=120.0)[0] is None
    # ... the outlet's own last purchase MRP is.
    ctx = ProductContext(last_mrp={'th': 140.0})
    assert _pick('TELMIBROOK', idx, ctx, mrp=140.0)[0] == 'TELMIBROOK H TAB'


# --- GSTIN ---------------------------------------------------------------------

def test_gstin_checksum():
    assert gstin_checksum_ok('27AAPCM1753L2ZX')
    assert gstin_checksum_ok('27AACFB4442P1Z8')
    assert not gstin_checksum_ok('27AAPCM1753L2ZY')


def test_gstin_ocr_confusions_are_repaired():
    assert normalize_gstin('27AAPCM1753L2ZX') == ('27AAPCM1753L2ZX', True)
    assert normalize_gstin('27 AAPCM 1753 L2ZX') == ('27AAPCM1753L2ZX', True)
    assert normalize_gstin('27AAPCMI753L22X') == ('27AAPCM1753L2ZX', True)


# --- distributors ----------------------------------------------------------------

DISTS = [
    DistributorRecord('d1', 'BASANT MEDICAL AGENCIES', gstin='27AACFB4442P1Z8'),
    DistributorRecord('d2', 'VASANT MEDICAL AGENCIES'),
    DistributorRecord('d3', 'ANIL MEDICAL STORES', phones={'7028165123'}),
    DistributorRecord('d4', 'SHRI SAMARTH MEDICO', dl_numbers={'314979'}),
    DistributorRecord('d5', 'SAMARTH PHARMA DISTRIBUTORS'),
    DistributorRecord('d6', 'RAAJYOG MEDICO'),
    DistributorRecord('d7', 'MANAVATA PHARMA PRIVATE LIMITED', gstin='27AAPCM1753L2ZX'),
]


def test_gstin_beats_name():
    # Name read badly, GSTIN read correctly -> GSTIN wins.
    m = match_distributor_records({'distributor_name': 'VASANT MEDICAL', 'gstin': '27AACFB4442P1Z8'}, DISTS)
    assert m['distributor_id'] == 'd1' and m['matched_by'] == 'gstin'


def test_gstin_one_char_misread():
    m = match_distributor_records({'distributor_name': '', 'gstin': '27AACFB4442P1Z9'}, DISTS)
    assert m['distributor_id'] == 'd1'


def test_generic_words_do_not_make_a_match():
    # Only "MEDICAL AGENCIES" in common -> must not grab Basant/Vasant.
    m = match_distributor_records({'distributor_name': 'SHREE MEDICAL AGENCIES'}, DISTS)
    assert m['distributor_id'] is None


def test_close_names_without_margin_are_not_guessed():
    m = match_distributor_records({'distributor_name': 'ASANT MEDICAL AGENCIES'}, DISTS)
    assert m['distributor_id'] is None


def test_name_match_when_clear():
    m = match_distributor_records({'distributor_name': 'M/S RAAJYOG MEDICO'}, DISTS)
    assert m['distributor_id'] == 'd6'
    m = match_distributor_records({'distributor_name': 'Basant Medical Agencies'}, DISTS)
    assert m['distributor_id'] == 'd1'


def test_phone_and_dl_match():
    m = match_distributor_records({'distributor_name': 'ANIL MEDICAL', 'phone': '2358110, 7028165123/7387100871'}, DISTS)
    assert m['distributor_id'] == 'd3'
    m = match_distributor_records({'distributor_name': 'SAMARTH', 'dl_no': '20B-314979, 21B-314980'}, DISTS)
    assert m['distributor_id'] == 'd4'


def test_learned_alias_wins():
    recs = DISTS + [DistributorRecord('d8', 'SAI DISTRIBUTORS', learned_names=[alias_key('S.A.I. DISTRIBUTION CO')])]
    m = match_distributor_records({'distributor_name': 'S.A.I. Distribution Co'}, recs)
    assert m['distributor_id'] == 'd8' and m['matched_by'] == 'learned_name'


def test_distinctive_similarity():
    assert distributor_name_similarity('BASANT MEDICAL AGENCIES', 'VASANT MEDICAL AGENCIES') < 0.95
    assert distributor_name_similarity('MANAVTA PHARMA PVT LTD', 'MANAVATA PHARMA PRIVATE LIMITED') > 0.88


def test_gstin_repaired_from_printed_pan():
    # Raajyog bill: blot over one letter + 2/3 confusion; PAN printed separately.
    assert normalize_gstin('27AMFPP9231A1ZC') == ('27AMFPP9231A1ZC', False)
    assert normalize_gstin('27AMFPP9231A1ZC', pan='AMCPP9221A') == ('27AMCPP9221A1ZC', True)


def test_gstin_rebuilt_when_characters_lost_under_blot():
    # gemini-3.1-flash-lite dropped 2 characters under the ink blot on the Raajyog bill.
    assert normalize_gstin('27APP9221A1ZC', pan='AMCPP9221A') == ('27AMCPP9221A1ZC', True)
    assert normalize_gstin('27APP9221A1ZC') == ('27APP9221A1ZC', False)


def test_glued_pack_count_is_not_part_of_the_name():
    # Production bill: catalogue "TELMA 40MG TAB 15TB" ranked BELOW "TELMA H" because
    # "15TB" was read as a variant + strength.
    t = tokenize_product('TELMA 40MG TAB 15TB')
    assert t.core == ('TELMA',) and t.strengths == {'40'} and t.forms == {'TAB'}
    assert tokenize_product('BIO D3 PLUS CAPSULE 15TAB').strengths == {'3'}
    assert tokenize_product('PAN 40 TAB').strengths == {'40'}        # spaced strength untouched
    idx = _catalog('TELMA H 40MG TAB 15S', 'TELMA AM 40MG TAB 15S', 'TELMA 40MG TAB 15TB')
    assert _pick('TELMA 40MG TAB', idx)[0] == 'TELMA 40MG TAB 15TB'
    # Bill without strength stays a staff decision
    idx2 = _catalog("LARIAGO 250MG TAB 10'S", "LARIAGO DS TAB 5'S", 'LARIAGO SUSP 60ML')
    assert _pick('LARIAGO TAB', idx2)[0] is None
