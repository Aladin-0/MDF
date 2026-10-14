process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000/api/v1';

const { getLineFilter } = require('../VoucherLinesGrid');

describe('VoucherLinesGrid - Accounting Ledger Filtering Rules', () => {
    describe('Payment Voucher', () => {
        it('should allow All for Debit line (Paid To)', () => {
            const filter = getLineFilter('payment', 'debit');
            expect(filter.filterGroup).toBeUndefined();
            expect(filter.placeholder).toContain('Paid To');
        });

        it('should strictly filter to Cash & Bank for Credit line (Paid From)', () => {
            const filter = getLineFilter('payment', 'credit');
            expect(filter.filterGroup).toBe('cashbank');
            expect(filter.placeholder).toContain('Paid From');
        });
    });

    describe('Receipt Voucher', () => {
        it('should strictly filter to Cash & Bank for Debit line (Deposited To)', () => {
            const filter = getLineFilter('receipt', 'debit');
            expect(filter.filterGroup).toBe('cashbank');
            expect(filter.placeholder).toContain('Deposited To');
        });

        it('should allow All for Credit line (Received From)', () => {
            const filter = getLineFilter('receipt', 'credit');
            expect(filter.filterGroup).toBeUndefined();
            expect(filter.placeholder).toContain('Received From');
        });
    });

    describe('Contra Voucher', () => {
        it('should strictly filter Both Debit and Credit lines to Cash & Bank', () => {
            const drFilter = getLineFilter('contra', 'debit');
            const crFilter = getLineFilter('contra', 'credit');

            expect(drFilter.filterGroup).toBe('cashbank');
            expect(crFilter.filterGroup).toBe('cashbank');
        });
    });

    describe('Journal Voucher', () => {
        it('should allow All for Both Debit and Credit lines', () => {
            const drFilter = getLineFilter('journal', 'debit');
            const crFilter = getLineFilter('journal', 'credit');

            expect(drFilter.filterGroup).toBeUndefined();
            expect(crFilter.filterGroup).toBeUndefined();
        });
    });
});
