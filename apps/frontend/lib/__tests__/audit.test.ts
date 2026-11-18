import { EMPTY_FILTERS, activeFilterCount, ago, comparison, dayHeading, eventParams, groupByDay, paramLabel, valueText, worstFlag, type AuditEvent } from '@/lib/audit';

const NOW = new Date(2026, 10, 17, 15, 0, 0);
const ev = (id: string, iso: string, extra: Partial<AuditEvent> = {}): AuditEvent => ({
    id, occurredAt: iso, code: 'x', action: 'X', module: 'm', category: 'money', categoryLabel: 'Money', label: '', summary: id, severity: 'info',
    actor: { id: 'a', name: 'A', role: 'admin' }, outlet: '', entity: { type: '', id: '', label: '', viewer: null }, amount: null, changes: [], reason: '',
    device: '', ip: null, insideNetwork: null, source: 'web', requestId: null, flags: [], ...extra,
});

describe('eventParams', () => {
    it('sends only what is set', () => {
        expect(eventParams(EMPTY_FILTERS).toString()).toBe('');
        const p = eventParams({ ...EMPTY_FILTERS, actor: 'u1', category: 'stock', flaggedOnly: true, hourFrom: '22', hourTo: '0', amountMin: '5000', q: '  INV-1 ' });
        expect(Object.fromEntries(p)).toEqual({ actor: 'u1', category: 'stock', flagged: '1', hourFrom: '22', hourTo: '0', amountMin: '5000', q: 'INV-1' });
    });
    it('keeps hour 0 (midnight), which is falsy', () => {
        expect(eventParams({ ...EMPTY_FILTERS, hourFrom: '0' }).get('hourFrom')).toBe('0');
    });
    it('counts the filters in use', () => {
        expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
        expect(activeFilterCount({ ...EMPTY_FILTERS, actor: 'u1', flaggedOnly: true })).toBe(2);
    });
});

describe('days and times', () => {
    it('names today and yesterday, then the date', () => {
        expect(dayHeading(new Date(2026, 10, 17, 9).toISOString(), NOW)).toBe('Today');
        expect(dayHeading(new Date(2026, 10, 16, 23).toISOString(), NOW)).toBe('Yesterday');
        expect(dayHeading(new Date(2026, 10, 12, 9).toISOString(), NOW)).toMatch(/12/);
    });
    it('groups newest-first events under one heading per day', () => {
        const g = groupByDay([ev('1', new Date(2026, 10, 17, 14).toISOString()), ev('2', new Date(2026, 10, 17, 9).toISOString()), ev('3', new Date(2026, 10, 16, 20).toISOString())], NOW);
        expect(g.map((x) => [x.heading, x.events.length])).toEqual([['Today', 2], ['Yesterday', 1]]);
    });
    it('says how long ago', () => {
        expect(ago(new Date(2026, 10, 17, 14, 58).toISOString(), NOW)).toBe('2 min ago');
        expect(ago(new Date(2026, 10, 17, 12).toISOString(), NOW)).toBe('3 h ago');
        expect(ago(new Date(2026, 10, 14, 15).toISOString(), NOW)).toBe('3 days ago');
        expect(ago(null, NOW)).toBe('never');
    });
});

describe('small helpers', () => {
    it('shows empty values as a dash and booleans as Yes/No', () => {
        expect([valueText(null), valueText(''), valueText(true), valueText(0), valueText('x')]).toEqual(['—', '—', 'Yes', '0', 'x']);
    });
    it('picks the most serious flag nobody has reviewed', () => {
        const f = (id: string, severity: any, status = 'new') => ({ id, rule: 'r', severity, title: id, status });
        expect(worstFlag([f('a', 'notice'), f('b', 'critical'), f('c', 'warning')])?.id).toBe('b');
        expect(worstFlag([f('a', 'critical', 'reviewed')])).toBeNull();
    });
    it('only compares when someone is clearly above the others', () => {
        expect(comparison(0, 3)).toBe('');
        expect(comparison(5, null)).toBe('');
        expect(comparison(5, 1.2)).toBe('');
        expect(comparison(9, 3)).toBe('3.0× the others');
    });
    it('labels a rule threshold by what it measures', () => {
        expect(paramLabel('big_discount', 'threshold')).toBe('Discount over (%)');
        expect(paramLabel('bulk_writeoff', 'count')).toBe('Number of batches');
    });
});
