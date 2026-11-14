import { NAV_ITEMS, activeNavItem, searchNav, visibleNavItems } from '@/lib/navConfig';

const all = visibleNavItems(() => true);

describe('activeNavItem: which top-level entry the current page belongs to', () => {
    it('a listed sub-page wins, even though its path also starts with another entry', () => {
        expect(activeNavItem('/dashboard/sales/quotations', all)?.label).toBe('Sales');
        expect(activeNavItem('/dashboard/accounts/sale-returns', all)?.label).toBe('Sales');      // listed under Sales, not Accounts
        expect(activeNavItem('/dashboard/reports/trial-balance', all)?.label).toBe('Accounts');   // listed under Accounts, not Reports
    });
    it('a page the menu does not list falls back to the entry whose path it sits under', () => {
        expect(activeNavItem('/dashboard/reports/erp-sales-book', all)?.label).toBe('Reports');
        expect(activeNavItem('/dashboard/customers/abc-123', all)?.label).toBe('Customers');
    });
    it('Dashboard is active only on its own page (its path prefixes everything)', () => {
        expect(activeNavItem('/dashboard', all)?.label).toBe('Dashboard');
        expect(activeNavItem('/dashboard/unknown-page', all)).toBeNull();
    });
    it('a path that merely starts with the same letters is not "under" an entry', () => {
        expect(activeNavItem('/dashboard/salesforce', all)).toBeNull();
    });
});

describe('searchNav: "Find a page" on the phone', () => {
    it('finds a sub-page by its name and says which group it is in', () => {
        const r = searchNav(all, 'trial');
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ label: 'Trial Balance', href: '/dashboard/reports/trial-balance', group: 'Accounts' });
    });
    it('a group name lists every page of the group', () => {
        const accounts = NAV_ITEMS.find((i) => i.label === 'Accounts')!;
        expect(searchNav(all, 'accounts').map((m) => m.href)).toEqual(accounts.subItems!.map((s) => s.href));
    });
    it('a plain entry is found by name, has no group, and the match ignores case and spaces around it', () => {
        const r = searchNav(all, '  CUSTOM ');
        expect(r).toEqual([expect.objectContaining({ label: 'Customers', href: '/dashboard/customers' })]);
        expect(r[0].group).toBeUndefined();
    });
    it('nothing typed, or nothing matching, gives an empty list', () => {
        expect(searchNav(all, '')).toEqual([]);
        expect(searchNav(all, '   ')).toEqual([]);
        expect(searchNav(all, 'zzzz')).toEqual([]);
    });
    it('only offers pages the user may open', () => {
        const none = visibleNavItems((p) => p === 'view_outlet');
        expect(searchNav(none, 'trial')).toEqual([]);
        expect(searchNav(none, 'stock').length).toBeGreaterThan(0);
    });
});
