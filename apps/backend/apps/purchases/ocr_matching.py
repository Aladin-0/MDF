"""
Matching logic for scanned purchase invoices.

Turns a product / distributor name read off a bill into a catalogue record.
Everything in this module is pure (no Django, no DB) so it can be unit tested
and benchmarked offline; ``ocr_engine`` loads the data and calls in here.

Design rules (learned from real bills):
* A wrong auto-pick is worse than no pick. We only auto-select when the best
  candidate is clearly ahead of the runner-up; otherwise we return suggestions
  and let the user choose (and that choice is learned as an alias).
* Strength / stage numbers are identity, not noise: DOLO 500 != DOLO 650,
  APTAMIL GOLD 1 != APTAMIL GOLD 3. Conflicting numbers are near-fatal.
* Variant suffixes are identity too: PAN 40 != PAN D != PAN DSR.
* Words like PHARMA / MEDICAL / AGENCIES / PVT LTD say nothing about *which*
  distributor it is, so they are ignored when comparing distributor names.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

from rapidfuzz import fuzz, process

# ---------------------------------------------------------------------------
# Product name normalisation
# ---------------------------------------------------------------------------

FORM_MAP = {
    'TAB': 'TAB', 'TABS': 'TAB', 'TABLET': 'TAB', 'TABLETS': 'TAB', 'TBL': 'TAB', 'TB': 'TAB',
    'CAP': 'CAP', 'CAPS': 'CAP', 'CAPSULE': 'CAP', 'CAPSULES': 'CAP',
    'SYP': 'SYP', 'SYR': 'SYP', 'SYRUP': 'SYP',
    'SUSP': 'SUSP', 'SUS': 'SUSP', 'SUSPENSION': 'SUSP',
    'INJ': 'INJ', 'INJECTION': 'INJ', 'VIAL': 'INJ', 'AMP': 'INJ',
    'OINT': 'OINT', 'OINTMENT': 'OINT', 'OIN': 'OINT',
    'CRM': 'CREAM', 'CREAM': 'CREAM',   # not 'CR' — that is "controlled release"
    'GEL': 'GEL', 'LOT': 'LOTION', 'LOTION': 'LOTION',
    'DROP': 'DROPS', 'DROPS': 'DROPS', 'DRP': 'DROPS', 'DRPS': 'DROPS',
    'SOL': 'SOL', 'SOLUTION': 'SOL', 'LIQ': 'SOL', 'LIQUID': 'SOL',
    'PWD': 'POWDER', 'POW': 'POWDER', 'POWDER': 'POWDER', 'PDR': 'POWDER',
    'SACHET': 'SACHET', 'SACHETS': 'SACHET', 'SAC': 'SACHET', 'SACH': 'SACHET',
    'SPRAY': 'SPRAY', 'INH': 'INHALER', 'INHALER': 'INHALER',
    'RESP': 'RESPULES', 'RESPULES': 'RESPULES', 'RESPULE': 'RESPULES',
    'SOAP': 'SOAP', 'SERUM': 'SERUM', 'SHAMPOO': 'SHAMPOO', 'FACEWASH': 'FACEWASH',
}
# Tokens that describe packaging, never identity.
PACK_NOISE = {
    'STRIP', 'STRIPS', 'STP', 'PCS', 'PC', 'NOS', 'NO', 'BOX', 'BOTTLE', 'BTL',
    'TUBE', 'UNIT', 'UNITS', 'PACK', 'PKT', 'OF', 'S', 'X', 'NEW', 'N',
}
UNIT_MAP = {
    'MG': 'MG', 'MCG': 'MCG', 'UG': 'MCG', 'G': 'G', 'GM': 'G', 'GMS': 'G',
    'GRAM': 'G', 'KG': 'KG', 'ML': 'ML', 'L': 'L', 'LTR': 'L', 'IU': 'IU',
    '%': '%', 'W': '%', 'V': '%',
}
# Units that are dropped even without a number in front ("L", "G" are not:
# MAXOZA-L, VITAMIN-G are variants).
STANDALONE_UNITS = {'MG', 'MCG', 'ML', 'GM', 'GMS', 'GRAM', 'IU', 'KG', 'LTR', '%'}
# Longer words that mark a distinct variant of a brand.
VARIANT_WORDS = {
    'PLUS', 'FORTE', 'NEO', 'GOLD', 'KID', 'KIDS', 'JUNIOR', 'JR', 'ADULT',
    'MAX', 'ACTIVE', 'ULTRA', 'TRIO', 'DUO', 'TOTAL', 'ADVANCE', 'ADVANCED',
    'PEDIATRIC', 'PAED', 'PED', 'INFANT', 'LITE', 'EXTRA', 'SUPER', 'NANO',
}

_PAREN_RE = re.compile(r'\([^)]*\)|\[[^\]]*\]')
_PACK_PATTERNS = [
    re.compile(r"\b\d+\s*[X\*]\s*\d+\s*'?\s*S?\b"),     # 1X10, 1*15, 10X10'S
    re.compile(r"\b\d+\s*'\s*S\b"),                     # 10'S
    re.compile(r"\b\d+\s*S\b"),                         # 10S, 15S
    # pack count glued to a unit word: 15TB, 10TAB, 15CAP, 10PCS (a strength is
    # written with a space or a unit: "PAN 40 TAB", "DOLO 650MG")
    re.compile(r"\b\d+(?:TB|TBS|TAB|TABS|CAP|CAPS|PCS|NOS|STRIPS?)\b"),
]
_SPLIT_ALNUM_RE = re.compile(r'(?<=[A-Z])(?=\d)|(?<=\d)(?=[A-Z%])')
_NUM_RE = re.compile(r'^\d+(?:\.\d+)?$')


def _norm_number(tok: str) -> str:
    try:
        val = float(tok)
    except ValueError:
        return tok
    return ('%g' % val) if val != int(val) else str(int(val))


@dataclass(frozen=True)
class ProductTokens:
    core: tuple            # identity words in order (brand first)
    strengths: frozenset   # normalised numbers ("650", "2.5", "3")
    forms: frozenset       # canonical dosage forms
    variants: frozenset    # short / variant tokens after the brand
    core_str: str          # ' '.join(core) — used for fuzzy scoring

    @property
    def brand(self) -> str:
        return self.core[0] if self.core else ''


def tokenize_product(name: str) -> ProductTokens:
    s = (name or '').upper()
    s = _PAREN_RE.sub(' ', s)
    s = s.replace('&', ' ')
    for pat in _PACK_PATTERNS:
        s = pat.sub(' ', s)
    # Keep decimals (2.5) and percent, drop other punctuation.
    s = re.sub(r'(?<!\d)\.|\.(?!\d)', ' ', s)
    s = re.sub(r'[^A-Z0-9.% ]', ' ', s)
    s = _SPLIT_ALNUM_RE.sub(' ', s)
    raw = [t for t in s.split() if t]

    core, strengths, forms, variants = [], set(), set(), set()
    i = 0
    while i < len(raw):
        tok = raw[i]
        if _NUM_RE.match(tok):
            strengths.add(_norm_number(tok))
            # swallow a following unit (650 MG) — units are not identity
            if i + 1 < len(raw) and raw[i + 1] in UNIT_MAP:
                i += 1
            i += 1
            continue
        if tok in FORM_MAP:
            forms.add(FORM_MAP[tok])
        elif tok in STANDALONE_UNITS or tok in PACK_NOISE:
            pass
        else:
            if core and (len(tok) <= 3 or tok in VARIANT_WORDS):
                variants.add(tok)
            core.append(tok)
        i += 1
    return ProductTokens(
        core=tuple(core),
        strengths=frozenset(strengths),
        forms=frozenset(forms),
        variants=frozenset(variants),
        core_str=' '.join(core),
    )


def alias_key(name: str) -> str:
    """Stable key used to store / look up learned aliases."""
    s = re.sub(r'[^A-Z0-9]+', ' ', (name or '').upper())
    return ' '.join(s.split())


# ---------------------------------------------------------------------------
# Product scoring
# ---------------------------------------------------------------------------

@dataclass
class CatalogProduct:
    id: str
    name: str
    tokens: ProductTokens
    manufacturer: str = ''
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None
    pack_size: Optional[int] = None
    pack_unit: Optional[str] = None
    mrp: Optional[float] = None
    discontinued: bool = False


@dataclass
class ProductContext:
    """Outlet / distributor history used as tie-breakers."""
    distributor_product_ids: set = field(default_factory=set)   # bought from this distributor before
    outlet_product_ids: set = field(default_factory=set)        # ever stocked at this outlet
    batch_index: dict = field(default_factory=dict)             # BATCH_NO -> {product_id, ...}
    last_mrp: dict = field(default_factory=dict)                # product_id -> latest batch MRP at outlet


AUTO_MATCH_MIN = 0.84
AUTO_MATCH_MARGIN = 0.05
SUGGEST_MIN = 0.55


def name_similarity(bill: ProductTokens, cand: ProductTokens) -> float:
    """0..1 similarity of two product names, with identity guards."""
    if not bill.core or not cand.core:
        return 0.0
    sort_r = fuzz.token_sort_ratio(bill.core_str, cand.core_str) / 100.0
    set_r = fuzz.token_set_ratio(bill.core_str, cand.core_str) / 100.0
    brand_r = fuzz.ratio(bill.brand, cand.brand) / 100.0
    score = 0.45 * sort_r + 0.30 * set_r + 0.25 * brand_r

    sb, sc = bill.strengths, cand.strengths
    if sb and sc:
        if sb == sc:
            score += 0.04
        elif sb <= sc or sc <= sb:
            score *= 0.90          # one side just omits e.g. the pack volume
        else:
            score *= 0.45          # conflicting strength / stage => other product
    elif sb or sc:
        score *= 0.92

    if bill.forms and cand.forms and not (bill.forms & cand.forms):
        score *= 0.80

    for _ in bill.variants ^ cand.variants:
        score *= 0.82
    return max(0.0, min(score, 1.0))


def score_product(bill: ProductTokens, cand: CatalogProduct, ctx: ProductContext,
                  bill_batch: str = '', bill_mrp: Optional[float] = None,
                  bill_mfr: str = '') -> tuple:
    """(score, evidence) — evidence names the context signals that fired."""
    evidence = set()
    score = name_similarity(bill, cand.tokens)
    if score <= 0:
        return 0.0, evidence
    # Context only nudges candidates whose names already look right.
    if bill_batch and cand.id in ctx.batch_index.get(bill_batch, ()):
        score += 0.10
        evidence.add('batch')
    if cand.id in ctx.distributor_product_ids:
        score += 0.05
        evidence.add('distributor_history')
    elif cand.id in ctx.outlet_product_ids:
        score += 0.03
        evidence.add('outlet_history')
    outlet_mrp = ctx.last_mrp.get(cand.id)
    ref_mrp = outlet_mrp or cand.mrp
    if bill_mrp and ref_mrp:
        diff = abs(bill_mrp - ref_mrp) / max(ref_mrp, 0.01)
        if diff <= 0.02:
            score += 0.04
            # Only the outlet's own purchase history is trusted enough to
            # settle a tie; catalogue MRPs are often stale placeholders.
            evidence.add('mrp' if outlet_mrp else 'catalog_mrp')
        elif diff > 0.35:
            score -= 0.06
    if bill_mfr and cand.manufacturer:
        m = re.sub(r'[^A-Z]', '', bill_mfr.upper())[:4]
        if len(m) >= 3 and re.sub(r'[^A-Z]', '', cand.manufacturer.upper()).startswith(m):
            score += 0.02
    if cand.discontinued:
        score -= 0.03
    return score, evidence


class ProductIndex:
    """Pre-tokenised catalogue with a fast candidate pre-filter."""

    def __init__(self, products: Iterable[CatalogProduct]):
        self.products = list(products)
        self.by_id = {p.id: p for p in self.products}
        self._choices = [p.tokens.core_str for p in self.products]

    def candidates(self, bill: ProductTokens, ctx: ProductContext, limit: int = 40):
        if not bill.core_str:
            return []
        hits = process.extract(bill.core_str, self._choices, scorer=fuzz.WRatio,
                               limit=limit, score_cutoff=50)
        seen = {self.products[idx].id for _, _, idx in hits}
        out = [self.products[idx] for _, _, idx in hits]
        # Always consider products sharing the bill's brand word that this
        # outlet/distributor already deals in (cheap: small sets).
        for pid in (ctx.distributor_product_ids | ctx.outlet_product_ids):
            if pid in seen:
                continue
            p = self.by_id.get(pid)
            if p and p.tokens.brand and fuzz.ratio(p.tokens.brand, bill.brand) >= 80:
                out.append(p)
                seen.add(pid)
        return out


def rank_products(name: str, index: ProductIndex, ctx: Optional[ProductContext] = None,
                  batch_no: str = '', mrp: Optional[float] = None, mfr: str = ''):
    """Return a Ranking (best first) for one bill line."""
    ctx = ctx or ProductContext()
    bill = tokenize_product(name)
    batch_key = alias_key(batch_no).replace(' ', '')
    rows = []
    for p in index.candidates(bill, ctx):
        score, evidence = score_product(bill, p, ctx, batch_key, mrp, mfr)
        if score > 0:
            rows.append((score, p, evidence))
    rows.sort(key=lambda r: r[0], reverse=True)
    return Ranking(bill, rows)


@dataclass
class Ranking:
    bill: ProductTokens
    rows: list            # [(score, CatalogProduct, evidence:set)]

    def __len__(self):
        return len(self.rows)


def _underspecified(bill: ProductTokens, best: CatalogProduct, second: CatalogProduct) -> bool:
    """
    True when best and runner-up are siblings of the same brand and the bill
    lacks the very detail (strength / variant / form) that tells them apart,
    e.g. bill says "TELMIBROOK" and the catalogue has 40, H and AM.
    """
    b, s = best.tokens, second.tokens
    if not b.brand or b.brand != s.brand:
        return False
    # Bill names exactly this product (same words + strength): "NAPROHEAL-500"
    # vs "NAPROHEAL 500 SR" — an SR would have been printed.
    if bill.core == b.core and bill.strengths == b.strengths and (bill.forms or b.forms == s.forms):
        return False
    # Any detail on the bill that fits best but not the runner-up settles it.
    if bill.strengths and (bill.strengths == b.strengths) != (bill.strengths == s.strengths):
        return False
    if bill.variants and bool(bill.variants & b.variants) != bool(bill.variants & s.variants):
        return False
    if bill.forms and bool(bill.forms & b.forms) != bool(bill.forms & s.forms):
        return False
    if b.strengths != s.strengths and not bill.strengths:
        return True
    if b.variants != s.variants and not (bill.variants & (b.variants | s.variants)):
        return True
    if b.forms != s.forms and not bill.forms:
        return True
    return False


def decide_product(ranking) -> tuple:
    """(auto_pick or None, confidence, suggestions[list of CatalogProduct])."""
    rows = ranking.rows if isinstance(ranking, Ranking) else ranking
    if not rows:
        return None, 0.0, []
    best_score, best = rows[0][0], rows[0][1]
    conf = min(best_score, 1.0)
    suggestions = [r[1] for r in rows[:3] if r[0] >= SUGGEST_MIN]
    if best_score < AUTO_MATCH_MIN:
        return None, conf, suggestions
    if len(rows) > 1 and _is_ambiguous(ranking, rows):
        # Siblings the name alone can't separate: if exactly one of them has
        # hard evidence from this outlet's history (same batch number already
        # in stock, or its own last purchase MRP), that settles it.
        close = [r for r in rows if r[0] >= best_score - 0.20]
        hard = [r for r in close if {'batch', 'mrp'} & (r[2] if len(r) > 2 else set())]
        if len(hard) == 1 and hard[0][0] >= AUTO_MATCH_MIN - 0.10:
            pick = hard[0][1]
            return pick, min(hard[0][0], 1.0), [r[1] for r in rows[:3] if r[1] is not pick and r[0] >= SUGGEST_MIN]
        return None, conf, suggestions
    return best, conf, suggestions


def _is_ambiguous(ranking, rows) -> bool:
    """True when the top candidate is not clearly the right one."""
    best_score, best = rows[0][0], rows[0][1]
    best_ev = rows[0][2] if len(rows[0]) > 2 else set()
    second_score, second = rows[1][0], rows[1][1]
    second_ev = rows[1][2] if len(rows[1]) > 2 else set()
    decisive = bool({'batch', 'mrp'} & (best_ev - second_ev))
    if decisive:
        return False
    if best_score - second_score < AUTO_MATCH_MARGIN:
        return True
    return (isinstance(ranking, Ranking) and second_score >= best_score - 0.20
            and _underspecified(ranking.bill, best, second))


# ---------------------------------------------------------------------------
# GSTIN helpers
# ---------------------------------------------------------------------------

_GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
_TO_DIGIT = {'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1', 'T': '1', 'Z': '2',
             'S': '5', 'B': '8', 'G': '6'}
_TO_ALPHA = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B', '6': 'G', '4': 'A'}
# GSTIN layout: SS PPPPP NNNN P E Z C  (state, PAN letters/digits/letter, entity, 'Z', check)
_DIGIT_POS = (0, 1, 7, 8, 9, 10)
_ALPHA_POS = (2, 3, 4, 5, 6, 11)


def gstin_checksum_ok(g: str) -> bool:
    if len(g) != 15 or any(c not in _GST_CHARS for c in g):
        return False
    total = 0
    for i, ch in enumerate(g[:14]):
        prod = _GST_CHARS.index(ch) * (2 if i % 2 else 1)
        total += prod // 36 + prod % 36
    return _GST_CHARS[(36 - total % 36) % 36] == g[14]


_PAN_RE = re.compile(r'^[A-Z]{5}\d{4}[A-Z]$')


def normalize_gstin(raw: Optional[str], pan: Optional[str] = None) -> tuple:
    """
    Clean a GSTIN read by OCR. Returns (gstin_or_None, checksum_valid).
    Fixes the usual confusions (O/0, I/1, S/5, B/8...) using the fixed GSTIN
    layout and the checksum digit. When the bill also prints the PAN
    (= GSTIN characters 3-12), a blotted or misread PAN part is repaired from it.
    """
    if not raw:
        return None, False
    g = re.sub(r'[^A-Z0-9]', '', str(raw).upper())
    p = re.sub(r'[^A-Z0-9]', '', str(pan or '').upper())
    if len(g) != 15:
        # Characters lost under a blot / punch hole: rebuild from state code +
        # printed PAN + the last three characters, if the checksum agrees.
        if _PAN_RE.match(p) and len(g) >= 5 and g[:2].isdigit():
            rebuilt = g[:2] + p + g[-3:]
            if gstin_checksum_ok(rebuilt):
                return rebuilt, True
        return (g or None), False
    if gstin_checksum_ok(g):
        return g, True
    if _PAN_RE.match(p) and gstin_checksum_ok(g[:2] + p + g[12:]):
        return g[:2] + p + g[12:], True
    chars = list(g)
    for p in _DIGIT_POS:
        chars[p] = _TO_DIGIT.get(chars[p], chars[p])
    for p in _ALPHA_POS:
        chars[p] = _TO_ALPHA.get(chars[p], chars[p])
    if chars[13] == '2':
        chars[13] = 'Z'
    fixed = ''.join(chars)
    if gstin_checksum_ok(fixed):
        return fixed, True
    return fixed, False


def _hamming(a: str, b: str) -> int:
    if len(a) != len(b):
        return 99
    return sum(1 for x, y in zip(a, b) if x != y)


# ---------------------------------------------------------------------------
# Distributor matching
# ---------------------------------------------------------------------------

DIST_STOP = {
    'M', 'S', 'MS', 'PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'CO', 'COMPANY',
    'AND', 'THE', 'INC', 'CORP', 'OPC', 'P', 'SANCHALIT', 'PROP', 'PROPRIETOR',
}
DIST_GENERIC = {
    'PHARMA', 'PHARMAS', 'PHARMACEUTICAL', 'PHARMACEUTICALS', 'PHARMACY', 'MEDICAL',
    'MEDICALS', 'MEDICO', 'MEDICOS', 'MEDICINE', 'MEDICINES', 'MEDI', 'AGENCY',
    'AGENCIES', 'DISTRIBUTOR', 'DISTRIBUTORS', 'DISTRIBUTION', 'ENTERPRISE',
    'ENTERPRISES', 'TRADERS', 'TRADER', 'TRADING', 'STORES', 'STORE', 'HEALTHCARE',
    'HEALTH', 'CARE', 'SURGICAL', 'SURGICALS', 'CHEMIST', 'CHEMISTS', 'DRUG',
    'DRUGS', 'HOUSE', 'CORPORATION', 'ASSOCIATES', 'SALES', 'WHOLESALE',
    'WHOLESALERS', 'MARKETING', 'LIFESCIENCES', 'LIFE', 'SCIENCES', 'INDIA',
    'BIOTECH', 'GENERICS', 'CENTRE', 'CENTER', 'POINT', 'WORLD', 'SERVICES',
}


def _dist_tokens(name: str) -> tuple:
    s = re.sub(r'M\s*/\s*S\b', ' ', (name or '').upper())
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    words = [w for w in s.split() if w not in DIST_STOP]
    distinct = [w for w in words if w not in DIST_GENERIC]
    return words, distinct


def distributor_name_similarity(a: str, b: str) -> float:
    wa, da = _dist_tokens(a)
    wb, db = _dist_tokens(b)
    if not wa or not wb:
        return 0.0
    full = fuzz.token_sort_ratio(' '.join(wa), ' '.join(wb)) / 100.0
    if da and db:
        distinct = max(
            fuzz.token_sort_ratio(' '.join(da), ' '.join(db)),
            fuzz.token_set_ratio(' '.join(da), ' '.join(db)) - 5,
        ) / 100.0
        return 0.8 * distinct + 0.2 * full
    return 0.8 * full


def phone_set(*values) -> set:
    out = set()
    for v in values:
        if not v:
            continue
        for digits in re.findall(r'\d[\d\s-]{5,}\d', str(v)):
            d = re.sub(r'\D', '', digits)
            if len(d) >= 7:
                out.add(d[-10:])
    return out


def dl_numbers(*values) -> set:
    out = set()
    for v in values:
        if v:
            out.update(n for n in re.findall(r'\d{5,}', str(v)))
    return out


@dataclass
class DistributorRecord:
    id: str
    name: str
    gstin: str = ''
    phones: set = field(default_factory=set)
    dl_numbers: set = field(default_factory=set)
    learned_names: list = field(default_factory=list)   # alias_key()s confirmed by users
    learned_gstins: list = field(default_factory=list)


DIST_NAME_MIN = 0.88
DIST_NAME_MARGIN = 0.08


def match_distributor_records(header: dict, records: list) -> dict:
    """
    Pick the distributor that issued the bill. Order = most reliable first:
    exact GSTIN > learned alias > near-GSTIN (1 OCR slip) > phone / DL number
    > distinctive-name fuzzy match (only when clearly ahead of the runner-up).
    """
    none = {'distributor_id': None, 'match_tier': None, 'confidence': 0, 'is_new': True}
    if not records:
        return none

    gstin, gstin_ok = normalize_gstin(header.get('gstin'))
    name = header.get('distributor_name') or ''
    name_key = alias_key(name)

    def hit(rec, tier, conf, how):
        return {'distributor_id': rec.id, 'match_tier': tier, 'confidence': round(conf, 3),
                'is_new': False, 'matched_by': how, 'record': rec}

    def best_by_name(recs):
        return max(recs, key=lambda r: distributor_name_similarity(name, r.name)) if name else recs[0]

    if gstin and len(gstin) == 15:
        exact = [r for r in records if r.gstin and r.gstin.upper() == gstin]
        if exact:
            return hit(best_by_name(exact), 2, 1.0, 'gstin')
        learned = [r for r in records if gstin in r.learned_gstins]
        if learned:
            return hit(best_by_name(learned), 2, 0.98, 'learned_gstin')

    if name_key:
        learned = [r for r in records if name_key in r.learned_names]
        if learned:
            return hit(best_by_name(learned), 1, 0.97, 'learned_name')

    if gstin and len(gstin) == 15 and not gstin_ok:
        near = [r for r in records if r.gstin and _hamming(r.gstin.upper(), gstin) == 1]
        if len(near) == 1:
            return hit(near[0], 2, 0.9, 'gstin_near')

    phones = phone_set(header.get('phone'), header.get('mobile'))
    dls = dl_numbers(header.get('dl_no'), header.get('dl_20b'), header.get('dl_21b'))
    if phones or dls:
        contact = [r for r in records if (phones & r.phones) or (dls & r.dl_numbers)]
        if len(contact) == 1:
            return hit(contact[0], 3, 0.9, 'phone_or_dl')
        if len(contact) > 1 and name:
            return hit(best_by_name(contact), 3, 0.85, 'phone_or_dl')

    if name:
        scored = sorted(((distributor_name_similarity(name, r.name), r) for r in records),
                        key=lambda x: x[0], reverse=True)
        best_s, best = scored[0]
        second = scored[1][0] if len(scored) > 1 else 0.0
        if best_s >= DIST_NAME_MIN and best_s - second >= DIST_NAME_MARGIN:
            return hit(best, 1, best_s, 'name')
    return none
