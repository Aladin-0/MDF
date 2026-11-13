import { looksLikeBarcode } from '../searchSyntax';

describe('looksLikeBarcode', () => {
    it('accepts what a scanner types', () => {
        expect(looksLikeBarcode('8901234567890')).toBe(true);
        expect(looksLikeBarcode(' 8901234567890 ')).toBe(true);
        expect(looksLikeBarcode('ABC-123456')).toBe(true);
    });
    it('does not mistake a medicine search for a barcode', () => {
        expect(looksLikeBarcode('paracetamol')).toBe(false);
        expect(looksLikeBarcode('dolo650')).toBe(false);
        expect(looksLikeBarcode('dolo 650')).toBe(false);
        expect(looksLikeBarcode('L+23.50')).toBe(false);
        expect(looksLikeBarcode('C,losartan')).toBe(false);
        expect(looksLikeBarcode('12345')).toBe(false);
        expect(looksLikeBarcode('')).toBe(false);
    });
});
