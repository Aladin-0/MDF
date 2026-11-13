import { maskExpiryInput, finishExpiryInput, formatExpiryForDisplay, getExpiryStatus, calcPTR, calcPTS, isStartedLine, lineIssues, issueText } from '../purchaseLine';
import { emptyItem } from '../purchaseEntry';

const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

describe('expiry typing', () => {
    it('masks digits into MM/YYYY while typing', () => {
        expect(maskExpiryInput('1')).toBe('1');
        expect(maskExpiryInput('12')).toBe('12');
        expect(maskExpiryInput('122')).toBe('12/2');
        expect(maskExpiryInput('122027')).toBe('12/2027');
        expect(maskExpiryInput('1220279')).toBe('12/2027');      // a 5th year digit is dropped
        expect(maskExpiryInput('12/27')).toBe('12/27');          // already-masked text is stable
        expect(maskExpiryInput('ab1c2')).toBe('12');
    });
    it('finishes MM/YY and MM/YYYY into the stored first-of-month date', () => {
        expect(finishExpiryInput('12/27')).toBe('2027-12-01');
        expect(finishExpiryInput('03/2029')).toBe('2029-03-01');
        expect(finishExpiryInput('3/28')).toBe('2028-03-01');
    });
    it('leaves a bad month or half-typed text alone', () => {
        expect(finishExpiryInput('13/27')).toBe('13/27');
        expect(finishExpiryInput('12/2')).toBe('12/2');
        expect(finishExpiryInput('')).toBe('');
        expect(finishExpiryInput('2027-12-01')).toBe('2027-12-01');
    });
    it('shows a stored date as MM/YYYY but keeps hand-typed text as typed', () => {
        expect(formatExpiryForDisplay('2027-12-01')).toBe('12/2027');
        expect(formatExpiryForDisplay('12/20')).toBe('12/20');
        expect(formatExpiryForDisplay(undefined)).toBe('');
    });
});

describe('getExpiryStatus', () => {
    it('expired / near (under 90 days) / ok', () => {
        expect(getExpiryStatus(iso(-5))).toBe('expired');
        expect(getExpiryStatus(iso(30))).toBe('near');
        expect(getExpiryStatus(iso(400))).toBe('ok');
    });
    it('empty or unreadable is not flagged', () => { expect(getExpiryStatus('')).toBe('ok'); expect(getExpiryStatus('soon')).toBe('ok'); });
    it('understands hand-typed MM/YY', () => {
        const y = (new Date().getFullYear() + 3) % 100;
        expect(getExpiryStatus(`06/${y}`)).toBe('ok');
        expect(getExpiryStatus('01/20')).toBe('expired');
    });
});

describe('PTR / PTS defaults', () => {
    it('PTR works back from the MRP: (MRP - 20%) / (1 + GST)', () => { expect(calcPTR(100, 12)).toBe(71.43); expect(calcPTR(0, 12)).toBe(0); });
    it('PTS is 5% under PTR', () => { expect(calcPTS(100)).toBe(95); expect(calcPTS(0)).toBe(0); });
});

describe('lines', () => {
    const full = { ...emptyItem(), productId: 'p1', productName: 'DOLO', batchNo: 'B1', expiryDate: '12/2027', pkg: 10, qty: 2, purchaseRate: 20, mrp: 32 };
    it('a blank row is not started; a chosen product or a typed name is', () => {
        expect(isStartedLine(emptyItem())).toBe(false);
        expect(isStartedLine({ ...emptyItem(), productName: 'Dol' })).toBe(true);
        expect(isStartedLine({ ...emptyItem(), productId: 'p' })).toBe(true);
        expect(isStartedLine({ ...emptyItem(), productName: '   ' })).toBe(false);
    });
    it('a complete line has no issues', () => expect(lineIssues(full)).toEqual([]));
    it('lists what is missing, in filling order', () => {
        expect(lineIssues({ ...emptyItem(), productName: 'Dol' })).toEqual(['product', 'batch', 'expiry', 'pkg', 'qty', 'rate', 'mrp']);   // the desktop column order
        expect(lineIssues({ ...full, batchNo: '', qty: 0 })).toEqual(['batch', 'qty']);
    });
    it('an expiry that cannot be read is an issue; stored ISO and typed MM/YY are fine', () => {
        expect(lineIssues({ ...full, expiryDate: '13/27' })).toEqual(['expiry']);
        expect(lineIssues({ ...full, expiryDate: '2027-12-01' })).toEqual([]);
        expect(lineIssues({ ...full, expiryDate: '12/27' })).toEqual([]);
    });
    it('PKG is an issue when blank, zero, negative, a decimal or over 1000, and never defaults to 1', () => {
        for (const bad of ['', 0, -5, 7.5, '7.5', 'abc', 1001, null, undefined]) expect(lineIssues({ ...full, pkg: bad as any })).toEqual(['pkg']);
        for (const good of [1, 10, '15', 1000]) expect(lineIssues({ ...full, pkg: good as any })).toEqual([]);
    });
    it('has plain words for each issue', () => { expect(issueText('batch')).toBe('Batch number needed'); expect(issueText('expiry')).toMatch(/MM\/YY/); expect(issueText('pkg')).toBe('Pkg (units per pack) needed'); });
});
