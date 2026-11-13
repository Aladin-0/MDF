"""
What the medicine search box means.  Pure functions, no database, so every syntax can be tested on its own.

Pharmacists (and billing software such as Marg / Evital) type short codes instead of full names:

    dolo            plain search: every word must appear in the name / salt / maker, in any order
    L+175           "price I roughly remember": names starting with L priced about 175 (+/-10%, at least +/-1), closest first
    L+20-30         a price range;  L+<50 up to 50;  L+>100 from 100;  L+=23.50 exactly 23.50
    C,losartan      "salt search": every brand whose composition contains losartan
    8901234567890   a scanned barcode: exactly that product

Substitutes ("same salt, other brand") are not a typed query; see `salt_set` / `strengths` / `dosage_form`.
"""
import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import List, Optional

MIN_CHARS = 2

_NUM = r'\d+(?:\.\d{1,2})?'
# after the '+': a number ("175", "23.50"), optionally ~175, =23.50, <50, >100, or a range 20-30
_PRICE = re.compile(r'^\s*(?P<prefix>[^+]*?)\s*\+\s*(?P<op>[=~<>]?)\s*(?P<a>' + _NUM + r')(?:\s*-\s*(?P<b>' + _NUM + r'))?\s*$')
PRICE_TOLERANCE = Decimal('0.10')       # "about 175" means 157.50 - 192.50
PRICE_MIN_TOLERANCE = Decimal('1')      # but never tighter than +/-1 rupee (a Rs 5 item is "about" 4 - 6)
_SALT = re.compile(r'^\s*[cC]\s*,\s*(?P<rest>.*?)\s*$')
_BARCODE_CHARS = re.compile(r'^[0-9A-Za-z\-]{6,64}$')


@dataclass
class ParsedQuery:
    kind: str                       # 'text' | 'price' | 'salt' | 'barcode'
    raw: str
    tokens: List[str] = field(default_factory=list)
    # price search only: the MRP window to match (high None = no upper limit) and, for "about N", the number to rank closeness by
    price_low: Optional[Decimal] = None
    price_high: Optional[Decimal] = None
    price_target: Optional[Decimal] = None

    @property
    def usable(self) -> bool:
        """False when the query is a recognised syntax but too short to search on (e.g. 'C,l'). A price search is fine with ONE letter: 'L+23.50'."""
        if self.kind in ('barcode', 'price'):
            return bool(self.tokens)
        return len(''.join(self.tokens)) >= MIN_CHARS


def looks_like_barcode(text: str) -> bool:
    """One word of letters/digits/dashes with at least 6 digits: what a hardware scanner types. 'paracetamol' or 'dolo650' is not."""
    text = (text or '').strip()
    return bool(_BARCODE_CHARS.match(text)) and sum(ch.isdigit() for ch in text) >= 6


def parse_query(raw: str) -> ParsedQuery:
    raw = (raw or '').strip()

    if looks_like_barcode(raw):
        return ParsedQuery('barcode', raw, [raw])

    m = _SALT.match(raw)
    if m:
        tokens = [t for t in re.split(r'[,\s]+', m.group('rest')) if t]
        return ParsedQuery('salt', raw, tokens)

    m = _PRICE.match(raw)
    if m and m.group('prefix'):
        tokens = [t for t in m.group('prefix').split() if t]
        op, first = m.group('op'), Decimal(m.group('a'))
        if m.group('b'):
            if not op:                                              # 20-30 (an operator on a range, '<20-30', is not a price search)
                second = Decimal(m.group('b'))
                return ParsedQuery('price', raw, tokens, price_low=min(first, second), price_high=max(first, second))
        elif op == '=':
            return ParsedQuery('price', raw, tokens, price_low=first, price_high=first, price_target=first)
        elif op == '<':
            return ParsedQuery('price', raw, tokens, price_low=Decimal('0'), price_high=first)
        elif op == '>':
            return ParsedQuery('price', raw, tokens, price_low=first, price_high=None)
        else:                                                       # 175 or ~175: about that much, closest first
            slack = max(first * PRICE_TOLERANCE, PRICE_MIN_TOLERANCE)
            return ParsedQuery('price', raw, tokens, price_low=max(first - slack, Decimal('0')), price_high=first + slack, price_target=first)

    return ParsedQuery('text', raw, [t for t in re.split(r'\s+', raw) if t])


# ── substitutes ───────────────────────────────────────────────────────────────

_SALT_SPLIT = re.compile(r'\s*(?:&|\+|,|/|;|\band\b|\bwith\b)\s*', re.I)
_PLACEHOLDERS = {'', 'blank', 'na', 'nil', 'none', 'null', 'nan'}


def salt_set(composition: str) -> frozenset:
    """
    The salts of a composition, order and punctuation ignored: 'LOSARTAN POTASSIUM & ATENOLOL' == 'atenolol + losartan potassium'.
    Empty for a missing composition or the '-BLANK-' placeholder, so two unknown products never count as "the same".
    """
    salts = set()
    for part in _SALT_SPLIT.split((composition or '').lower()):
        cleaned = re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', part)).strip()
        if cleaned and cleaned not in _PLACEHOLDERS:
            salts.add(cleaned)
    return frozenset(salts)


# 'ml' is deliberately not a strength: '60ML' on a syrup is the bottle size ('125MG/5ML' still gives its 125 mg)
_STRENGTH = re.compile(r'(\d+(?:\.\d+)?)\s*(mg|mcg|gms?|g|iu|%)(?![a-z])', re.I)


def strengths(name: str) -> frozenset:
    """Strengths written in a product name ('LOSAR 50MG TAB' -> {(50, 'mg')}); the catalogue keeps them in the name, not the composition."""
    found = set()
    for number, unit in _STRENGTH.findall(name or ''):
        value = Decimal(number)
        unit = unit.lower()
        if unit in ('g', 'gm', 'gms'):
            value, unit = value * 1000, 'mg'
        found.add((value.normalize(), unit))
    return frozenset(found)


_FORMS = {
    'tab': 'tab', 'tabs': 'tab', 'tablet': 'tab', 'tablets': 'tab',
    'cap': 'cap', 'caps': 'cap', 'capsule': 'cap', 'capsules': 'cap',
    'syp': 'liquid', 'syr': 'liquid', 'syrup': 'liquid', 'susp': 'liquid', 'suspension': 'liquid', 'liquid': 'liquid', 'solution': 'liquid',
    'inj': 'inj', 'injection': 'inj',
    'drop': 'drops', 'drops': 'drops',
    'cream': 'topical', 'oint': 'topical', 'ointment': 'topical', 'gel': 'topical', 'lotion': 'topical',
    'powder': 'powder', 'sachet': 'powder',
    'spray': 'spray', 'inhaler': 'spray',
}


def dosage_form(name: str) -> Optional[str]:
    """tab / cap / liquid / inj ... read from the product name, or None when the name does not say."""
    for word in re.findall(r'[a-z]+', (name or '').lower()):
        if word in _FORMS:
            return _FORMS[word]
    return None
