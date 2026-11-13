"""
The one definition of what a pack is and when it may be sold loose.

Why this module exists
----------------------
A product's pack (size, unit, type) is stored twice: on `MasterProduct` (the catalogue) and on every
`Batch` (what is actually on the shelf and what billing sells from). The rule "can this be sold
loose?" was re-implemented in six places (sale service, legacy sale view, two serializers, three
frontend files) and the copies disagreed: the billing screen offered a Loose box, the server then
refused it, and a "runtime correction" (`_canonical_pack_type`) that quietly reinterpreted bad
data made it worse. Everything now goes through here, and the API sends the answer as
`allowsLoose` so the browser never has to guess.

The rule
--------
A pack can be split only if it holds a COUNTABLE number of smaller units:
    pack_size > 1  and  pack_type in LOOSE_PACK_TYPES
`pack_unit` is only a label (tablet, capsule, piece...). Bottles, vials, tubes... with a size above 1
mean a volume or weight (100 ml), not 100 sellable items, so they are whole-pack only.
To change the policy, change LOOSE_PACK_TYPES: nothing else needs touching.
"""
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError

# value, label. The frontend list (constants/productBehavior.ts) must offer exactly these.
PACK_TYPE_LABELS = (
    ('strip', 'Strip'),
    ('blister', 'Blister'),
    ('box', 'Box'),
    ('packet', 'Packet'),
    ('bottle', 'Bottle'),
    ('vial', 'Vial'),
    ('tube', 'Tube'),
    ('ampoule', 'Ampoule'),
    ('piece', 'Piece'),
    ('kit', 'Kit'),
    ('jar', 'Jar'),
    ('sachet', 'Sachet'),
    ('other', 'Other'),
)
PACK_TYPES = tuple(value for value, _ in PACK_TYPE_LABELS)

LOOSE_PACK_TYPES = frozenset({'strip', 'blister', 'box', 'packet', 'other'})

# A strip / blister is counted in tablets, capsules... A unit that names a container or a whole
# item ("a strip of 10 bottles") is a mix-up of type and unit: the exact data entry mistake behind
# "shows pieces, offers strips and loose, then refuses to sell loose".
_TABLET_PACK_TYPES = frozenset({'strip', 'blister'})
_NOT_A_COUNTED_UNIT = frozenset({
    'box', 'piece', 'pieces', 'bottle', 'vial', 'tube', 'packet', 'ampoule', 'jar', 'sachet', 'kit',
})


def normalize_pack_type(value):
    return (value or '').strip().lower()


def allows_loose(pack_size, pack_type):
    """True if one pack of this kind can be split and sold in smaller units."""
    try:
        size = int(pack_size or 1)
    except (TypeError, ValueError):
        return False
    return size > 1 and normalize_pack_type(pack_type) in LOOSE_PACK_TYPES


def batch_allows_loose(batch):
    """`allows_loose` for a batch. A batch saved without a pack type (older rows) uses its product's."""
    ptype = batch.pack_type or getattr(getattr(batch, 'product', None), 'pack_type', '')
    return allows_loose(batch.pack_size, ptype)


def pack_errors(pack_size, pack_unit, pack_type):
    """
    Everything wrong with a pack definition, as {field: message} (empty = fine).
    Checked on every write (product create/update, batch update) so a contradictory pack can no
    longer be saved; it used to be saved silently and only discovered at the billing counter.
    """
    errors = {}
    try:
        size = int(pack_size)
        if size < 1:
            raise ValueError
    except (TypeError, ValueError):
        errors['packSize'] = 'Pack size must be a whole number of 1 or more'
        size = None

    unit = (pack_unit or '').strip()
    if not unit:
        errors['packUnit'] = 'Pack unit is required'

    ptype = normalize_pack_type(pack_type)
    if ptype not in PACK_TYPES:
        errors['packType'] = f"Pack type must be one of: {', '.join(PACK_TYPES)}"
    elif unit and ptype in _TABLET_PACK_TYPES and unit.lower() in _NOT_A_COUNTED_UNIT:
        errors['packUnit'] = (
            f"A {ptype} is counted in tablets or capsules, not '{unit}'. "
            f"For pieces use pack type Box (or Piece), or change the unit to Tablet."
        )
    return errors


def fold_loose_into_packs(qty_strips, qty_loose, pack_size):
    """
    Keep the stock invariant `0 <= qty_loose < pack_size` after a pack size change: whole packs
    hiding in the loose count move to the pack count (7 loose of 5 -> +1 pack, 2 loose). A pack
    size of 1 has no loose at all.
    """
    size = max(int(pack_size or 1), 1)
    extra, rest = divmod(max(int(qty_loose or 0), 0), size)
    return int(qty_strips or 0) + extra, rest


def sync_batch_to_pack(batch, pack_size, pack_unit, pack_type):
    """
    Make `batch` carry the given pack definition. Returns the list of fields that changed (empty
    if it already matched), ready for `batch.save(update_fields=...)`. Loose stock is re-folded
    whenever the size changes, so a corrected size can never leave an impossible quantity behind.
    """
    changed = []
    if batch.pack_unit != pack_unit:
        batch.pack_unit = pack_unit
        changed.append('pack_unit')
    if batch.pack_type != pack_type:
        batch.pack_type = pack_type
        changed.append('pack_type')
    if batch.pack_size != pack_size:
        batch.pack_size = pack_size
        changed.append('pack_size')
    if 'pack_size' in changed or batch.qty_loose >= max(batch.pack_size or 1, 1):
        strips, loose = fold_loose_into_packs(batch.qty_strips, batch.qty_loose, batch.pack_size)
        if (strips, loose) != (batch.qty_strips, batch.qty_loose):
            batch.qty_strips, batch.qty_loose = strips, loose
            changed += [f for f in ('qty_strips', 'qty_loose') if f not in changed]
    return changed


def raise_if_invalid(pack_size, pack_unit, pack_type):
    errors = pack_errors(pack_size, pack_unit, pack_type)
    if errors:
        raise ValidationError(errors)


# ── PKG on a purchase line ───────────────────────────────────────────────────────────────────────────
# "PKG" is how many units are in one pack of what the supplier delivered (10 tablets per strip). It sets how much stock a line adds
# ((qty + free) x PKG units) and the pack size of the batch billing sells from, so a wrong number silently creates or loses stock.
# The catalogue's largest pack is 120; the limit leaves headroom for boxes of loose items without allowing typing mistakes (15000).
MAX_PURCHASE_PKG = 1000


def parse_purchase_pkg(raw):
    """
    The PKG of a purchase line as a whole number from 1 to MAX_PURCHASE_PKG.
    Raises ValueError('...') with the reason ("is missing", "must be a whole number", "must be between 1 and 1000"): never guesses.
    (It used to be `int(pkg or 1)`: 0 and "" became 1, 7.5 was cut to 7 and -5 was stored as the batch's pack size.)
    """
    if raw is None or isinstance(raw, bool) or (isinstance(raw, str) and not raw.strip()):
        raise ValueError('is missing')
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        raise ValueError('must be a whole number')
    if not value.is_finite() or value != value.to_integral_value():
        raise ValueError('must be a whole number')
    number = int(value)
    if number < 1 or number > MAX_PURCHASE_PKG:
        raise ValueError(f'must be between 1 and {MAX_PURCHASE_PKG}')
    return number

