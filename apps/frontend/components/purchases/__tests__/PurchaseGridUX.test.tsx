import { PURCHASE_ITEM_COLS, formatExpiryForDisplay } from '../PurchaseItemRow';

describe('Purchase Item Grid UX Specifications', () => {
    describe('Column Order Alignment', () => {
        it('places MRP immediately after Free and before Rate', () => {
            const keys = PURCHASE_ITEM_COLS.map(c => c.key);
            const freeIdx = keys.indexOf('free');
            const mrpIdx = keys.indexOf('mrp');
            const rateIdx = keys.indexOf('rate');

            expect(freeIdx).toBeGreaterThan(-1);
            expect(mrpIdx).toBe(freeIdx + 1);
            expect(rateIdx).toBe(mrpIdx + 1);
        });

        it('places Disc% immediately before Amount', () => {
            const keys = PURCHASE_ITEM_COLS.map(c => c.key);
            const discIdx = keys.indexOf('disc');
            const amountIdx = keys.indexOf('amount');

            expect(discIdx).toBeGreaterThan(-1);
            expect(amountIdx).toBe(discIdx + 1);
        });

        it('verifies full ordered list of grid columns', () => {
            const keys = PURCHASE_ITEM_COLS.map(c => c.key);
            expect(keys).toEqual([
                '#',
                'product',
                'hsn',
                'batch',
                'expiry',
                'pkg',
                'qty',
                'free',
                'mrp',
                'rate',
                'gst',
                'ptr',
                'pts',
                'disc',
                'amount',
                'expand',
                'remove',
            ]);
        });
    });

    describe('Expiry Date Formatting & Masking', () => {
        it('formats ISO dates YYYY-MM-DD to MM/YYYY', () => {
            expect(formatExpiryForDisplay('2026-12-01')).toBe('12/2026');
            expect(formatExpiryForDisplay('2025-05-15')).toBe('05/2025');
        });

        it('does NOT corrupt partial input 12/20 to 12/2020', () => {
            expect(formatExpiryForDisplay('12/20')).toBe('12/20');
        });

        it('preserves existing MM/YY and MM/YYYY values', () => {
            expect(formatExpiryForDisplay('12/25')).toBe('12/25');
            expect(formatExpiryForDisplay('12/2025')).toBe('12/2025');
        });

        it('returns empty string for undefined or empty input', () => {
            expect(formatExpiryForDisplay('')).toBe('');
            expect(formatExpiryForDisplay(undefined)).toBe('');
        });

        it('simulates auto-formatting onChange handler logic', () => {
            const formatInput = (input: string) => {
                let rawValue = input.replace(/\D/g, '');
                let formattedValue = rawValue;
                if (rawValue.length > 2) {
                    formattedValue = `${rawValue.slice(0, 2)}/${rawValue.slice(2, 6)}`;
                }
                return formattedValue;
            };

            // 1 or 2 digits
            expect(formatInput('1')).toBe('1');
            expect(formatInput('12')).toBe('12');

            // 4 digits (MMYY)
            expect(formatInput('1225')).toBe('12/25');

            // 6 digits (MMYYYY)
            expect(formatInput('122025')).toBe('12/2025');

            // Non-digits stripped
            expect(formatInput('12-25')).toBe('12/25');
            expect(formatInput('12abc2026')).toBe('12/2026');

            // Over 6 digits capped to 6 digits (2 month + 4 year)
            expect(formatInput('122026999')).toBe('12/2026');
        });
    });
});
