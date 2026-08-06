/**
 * Utility functions for product related logic.
 */

/**
 * Infers the smallest dispensing unit based on the product name and pack type.
 * @param productName The name of the product
 * @param packType The selected pack type (e.g. 'strip', 'bottle', 'tube')
 * @returns The inferred unit as a string
 */
export function inferPackUnit(productName: string, packType: string): string {
    const nameLower = (productName || '').toLowerCase();

    if (packType === 'strip' || packType === 'blister') {
        if (nameLower.includes('cap') || nameLower.includes('capsule')) return 'Capsule';
        if (nameLower.includes('softgel')) return 'Softgel';
        return 'Tablet';
    }

    if (packType === 'bottle') {
        if (nameLower.includes('syr') || nameLower.includes('syrup')) return 'Syrup';
        if (nameLower.includes('susp')) return 'Suspension';
        if (nameLower.includes('drop')) return 'Drops';
        if (nameLower.includes('inj') || nameLower.includes('injection')) return 'Vial';
        return 'Bottle';
    }

    if (packType === 'tube') {
        if (nameLower.includes('cream')) return 'Cream';
        if (nameLower.includes('gel')) return 'Gel';
        if (nameLower.includes('oint') || nameLower.includes('ointment')) return 'Ointment';
        return 'Tube';
    }

    if (packType === 'box') return 'Piece';
    if (packType === 'jar') return 'Jar';
    if (packType === 'sachet') return 'Sachet';
    if (packType === 'ampoule') return 'Ampoule';
    if (packType === 'kit') return 'Kit';

    // Default fallback
    return 'Piece';
}
