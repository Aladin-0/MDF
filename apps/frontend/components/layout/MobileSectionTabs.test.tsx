import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, act, within } from '@testing-library/react';

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => mockPathname }));

import { MobileSectionTabs } from '@/components/layout/MobileSectionTabs';
import { useAuthStore } from '@/store/authStore';

const setup = (path: string, role = 'admin') => {
    mockPathname = path;
    act(() => { useAuthStore.setState({ user: { id: 'u1', name: 'S', role } as any, isAuthenticated: true }); });
    return render(<MobileSectionTabs />);
};

describe('Phone section tabs (the pages of the group you are in)', () => {
    it('inside Sales: one chip per page, the current one marked, and a name that says which group', () => {
        setup('/dashboard/sales/quotations');
        const nav = screen.getByRole('navigation', { name: 'Sales pages' });
        expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Invoices', 'Quotations', 'Sale Returns', 'Revision History']);
        expect(within(nav).getByRole('link', { name: 'Quotations' })).toHaveAttribute('aria-current', 'page');
        expect(within(nav).getByRole('link', { name: 'Invoices' })).not.toHaveAttribute('aria-current');
    });

    it('a long group (Accounts, seven pages) shows them all in one scrolling row', () => {
        setup('/dashboard/reports/trial-balance');
        const nav = screen.getByRole('navigation', { name: 'Accounts pages' });
        expect(within(nav).getAllByRole('link')).toHaveLength(7);
        expect(within(nav).getByRole('link', { name: 'Trial Balance' })).toHaveAttribute('aria-current', 'page');
    });

    it('each chip is a real link to the page', () => {
        setup('/dashboard/sales');
        expect(screen.getByRole('link', { name: 'Quotations' })).toHaveAttribute('href', '/dashboard/sales/quotations');
    });

    it('is hidden from lg up (the desktop bar has its own pull-downs)', () => {
        setup('/dashboard/sales');
        expect(screen.getByTestId('section-tabs').className).toMatch(/\blg:hidden\b/);
    });

    it('shows nothing on a page that is not in a group, or in a group with one page', () => {
        const a = setup('/dashboard/customers');
        expect(screen.queryByTestId('section-tabs')).toBeNull();
        a.unmount();
        const b = setup('/dashboard');
        expect(screen.queryByTestId('section-tabs')).toBeNull();
        b.unmount();
    });

    it('lists only the pages the user may open', () => {
        // a billing clerk sees the Sales pages they may open, and never Accounts
        setup('/dashboard/accounts/vouchers', 'billing_staff');
        expect(screen.queryByRole('navigation', { name: 'Accounts pages' })).toBeNull();
    });
});
