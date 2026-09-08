export const PACK_TYPE_OPTIONS = [
    { value: 'strip', label: 'Strip' },
    { value: 'bottle', label: 'Bottle' },
    { value: 'vial', label: 'Vial' },
    { value: 'box', label: 'Box' },
    { value: 'tube', label: 'Tube' },
    { value: 'ampoule', label: 'Ampoule' },
    { value: 'piece', label: 'Piece' },
    { value: 'kit', label: 'Kit' },
    { value: 'jar', label: 'Jar' },
    { value: 'sachet', label: 'Sachet' },
] as const;

export const DISPENSING_UNIT_OPTIONS = [
    { value: 'Tablet', label: 'Tablet' },
    { value: 'Piece', label: 'Piece' },
    { value: 'Strip', label: 'Strip' },
] as const;
