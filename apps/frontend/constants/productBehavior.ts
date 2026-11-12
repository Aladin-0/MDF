export const PACK_TYPE_OPTIONS = [
    // Exactly the server's list (apps/inventory/pack_rules.py PACK_TYPE_LABELS): a type the server
    // does not know is refused on save, and one only the server knows would show as a blank box here.
    { value: 'strip', label: 'Strip' },
    { value: 'blister', label: 'Blister' },
    { value: 'box', label: 'Box' },
    { value: 'packet', label: 'Packet' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'vial', label: 'Vial' },
    { value: 'tube', label: 'Tube' },
    { value: 'ampoule', label: 'Ampoule' },
    { value: 'piece', label: 'Piece' },
    { value: 'kit', label: 'Kit' },
    { value: 'jar', label: 'Jar' },
    { value: 'sachet', label: 'Sachet' },
    { value: 'other', label: 'Other' },
] as const;

export const DISPENSING_UNIT_OPTIONS = [
    { value: 'Tablet', label: 'Tablet' },
    { value: 'Piece', label: 'Piece' },
    { value: 'Strip', label: 'Strip' },
] as const;

/** Units a pack can be counted in. Shared by every pack editor, so the lists cannot drift apart. */
export const PACK_UNIT_OPTIONS = [
    { value: 'tablet', label: 'Tablet' },
    { value: 'capsule', label: 'Capsule' },
    { value: 'piece', label: 'Piece' },
    { value: 'ml', label: 'ml' },
    { value: 'gm', label: 'gm' },
    { value: 'mg', label: 'mg' },
    { value: 'drop', label: 'Drop' },
    { value: 'suppository', label: 'Suppository' },
    { value: 'injection', label: 'Injection' },
    { value: 'patch', label: 'Patch' },
    { value: 'inhaler', label: 'Inhaler' },
    { value: 'spray', label: 'Spray' },
] as const;
