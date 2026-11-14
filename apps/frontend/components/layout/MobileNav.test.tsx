import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }), usePathname: () => mockPathname }));
const mockLogout = jest.fn();
jest.mock('@/lib/auth', () => ({ handleLogout: () => mockLogout() }));

import { MobileNav } from '@/components/layout/MobileNav';
import { useAuthStore } from '@/store/authStore';

const setup = (path = '/dashboard', role = 'admin', replaceHistory = false) => {
    mockPathname = path;
    act(() => { useAuthStore.setState({ user: { id: 'u1', name: 'Sainath', role } as any, isAuthenticated: true }); });
    const onNavigate = jest.fn();
    render(<MobileNav onNavigate={onNavigate} replaceHistory={replaceHistory} />);
    return { onNavigate };
};
const group = (name: string) => screen.getByRole('button', { name });
const linkNames = () => within(screen.getByRole('navigation', { name: 'Main menu' })).queryAllByRole('link').map((a) => a.textContent?.trim());

beforeEach(() => { mockPush.mockClear(); mockReplace.mockClear(); mockLogout.mockClear(); });

describe('Phone menu: groups', () => {
    it('lists every group closed on a page that is not in a group, and every plain entry as a link', () => {
        setup('/dashboard');
        for (const g of ['Sales', 'Inventory', 'Purchases', 'Staff', 'Accounts', 'Reports']) expect(group(g)).toHaveAttribute('aria-expanded', 'false');
        expect(linkNames()).toEqual(expect.arrayContaining(['Dashboard', 'Billing', 'Customers', 'Credit', 'GST', 'Settings']));
        expect(screen.queryByRole('link', { name: 'Trial Balance' })).toBeNull();
    });

    it('tapping a group opens ITS pages from any page and goes nowhere (the old menu showed them only once you were inside the group)', () => {
        const { onNavigate } = setup('/dashboard');
        fireEvent.click(group('Accounts'));
        expect(group('Accounts')).toHaveAttribute('aria-expanded', 'true');
        for (const p of ['Accounts Dashboard', 'New Voucher', 'All Vouchers', 'Ledgers', 'Trial Balance', 'Balance Sheet', 'Profit & Loss']) {
            expect(screen.getByRole('link', { name: p })).toBeInTheDocument();
        }
        expect(onNavigate).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('one group is open at a time, and tapping an open group closes it', () => {
        setup('/dashboard');
        fireEvent.click(group('Accounts'));
        fireEvent.click(group('Sales'));
        expect(group('Accounts')).toHaveAttribute('aria-expanded', 'false');
        expect(group('Sales')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByRole('link', { name: 'Trial Balance' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Quotations' })).toBeInTheDocument();
        fireEvent.click(group('Sales'));
        expect(group('Sales')).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens on the group you are in and marks the page you are on', () => {
        setup('/dashboard/sales/quotations');
        expect(group('Sales')).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('link', { name: 'Quotations' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', { name: 'Invoices' })).not.toHaveAttribute('aria-current');
        expect(group('Accounts')).toHaveAttribute('aria-expanded', 'false');
    });

    it('a plain entry is marked when you are on it', () => {
        setup('/dashboard/customers');
        expect(screen.getByRole('link', { name: 'Customers' })).toHaveAttribute('aria-current', 'page');
    });

    it('following a link closes the menu', () => {
        const { onNavigate } = setup('/dashboard');
        fireEvent.click(screen.getByRole('link', { name: 'Customers' }));
        expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('has no keyboard-shortcut badges (nobody has Alt on a phone)', () => {
        setup('/dashboard');
        expect(document.body.textContent).not.toMatch(/Alt\+/);
    });

    it('shows only what the user may open: a billing clerk has no Accounts, GST or Settings', () => {
        setup('/dashboard', 'billing_staff');
        expect(screen.queryByRole('button', { name: 'Accounts' })).toBeNull();
        expect(screen.queryByRole('link', { name: 'GST' })).toBeNull();
        expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
        expect(screen.getByRole('link', { name: 'Billing' })).toBeInTheDocument();
    });

    it('Chain Dashboard is offered to a super admin only', () => {
        setup('/dashboard', 'super_admin');
        expect(screen.getByRole('link', { name: 'Chain Dashboard' })).toBeInTheDocument();
    });
});

describe('Phone menu: Find a page', () => {
    const search = () => screen.getByTestId('nav-search') as HTMLInputElement;

    it('typing a page name lists just that page, with its group under it', () => {
        setup('/dashboard');
        fireEvent.change(search(), { target: { value: 'trial' } });
        const results = within(screen.getByTestId('nav-results')).getAllByRole('link');
        expect(results).toHaveLength(1);
        expect(results[0]).toHaveTextContent('Trial Balance');
        expect(results[0]).toHaveTextContent('Accounts');
        expect(screen.queryByRole('button', { name: 'Sales' })).toBeNull();     // the group list is replaced while searching
    });

    it('a group name lists all its pages', () => {
        setup('/dashboard');
        fireEvent.change(search(), { target: { value: 'sales' } });
        expect(within(screen.getByTestId('nav-results')).getAllByRole('link').map((a) => a.textContent)).toEqual(
            expect.arrayContaining([expect.stringContaining('Invoices'), expect.stringContaining('Quotations'), expect.stringContaining('Revision History')]));
    });

    it('Enter opens the first match and closes the menu; following a result also closes it', () => {
        const { onNavigate } = setup('/dashboard');
        fireEvent.change(search(), { target: { value: 'ledgers' } });
        fireEvent.keyDown(search(), { key: 'Enter' });
        expect(mockPush).toHaveBeenCalledWith('/dashboard/accounts/ledgers');
        expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('says so when nothing matches, and Enter then does nothing', () => {
        const { onNavigate } = setup('/dashboard');
        fireEvent.change(search(), { target: { value: 'zzzz' } });
        expect(screen.getByTestId('nav-no-match')).toHaveTextContent('No page matches “zzzz”');
        fireEvent.keyDown(search(), { key: 'Enter' });
        expect(mockPush).not.toHaveBeenCalled();
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('the clear button empties the box and brings the groups back', () => {
        setup('/dashboard');
        fireEvent.change(search(), { target: { value: 'trial' } });
        fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
        expect(search().value).toBe('');
        expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
    });
});

describe('Phone menu in a drawer whose Back button closes it (replaceHistory)', () => {
    // useBackToClose walks the browser back over its entry when the drawer closes. A link that navigates and closes in the same moment was
    // therefore undone: on the phone billing screen the menu could not take you anywhere.
    it('a link to ANOTHER page does not close the drawer itself and replaces the drawer\'s history entry', () => {
        const { onNavigate } = setup('/dashboard', 'admin', true);
        const link = screen.getByRole('link', { name: 'Customers' });
        expect(link).toHaveAttribute('href', '/dashboard/customers');
        fireEvent.click(link);
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('a link to the page you are already on closes the drawer (no page change will do it)', () => {
        const { onNavigate } = setup('/dashboard/customers', 'admin', true);
        fireEvent.click(screen.getByRole('link', { name: 'Customers' }));
        expect(onNavigate).toHaveBeenCalledTimes(1);
    });

    it('Find a page > Enter replaces instead of pushing, and leaves closing to the page change', () => {
        const { onNavigate } = setup('/dashboard', 'admin', true);
        const box = screen.getByTestId('nav-search');
        fireEvent.change(box, { target: { value: 'ledgers' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(mockReplace).toHaveBeenCalledWith('/dashboard/accounts/ledgers');
        expect(mockPush).not.toHaveBeenCalled();
        expect(onNavigate).not.toHaveBeenCalled();
    });

    it('Find a page > Enter on the page you are already on just closes the drawer', () => {
        const { onNavigate } = setup('/dashboard/accounts/ledgers', 'admin', true);
        const box = screen.getByTestId('nav-search');
        fireEvent.change(box, { target: { value: 'ledgers' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(mockReplace).not.toHaveBeenCalled();
        expect(onNavigate).toHaveBeenCalledTimes(1);
    });
});

describe('Phone menu keys stay inside the menu', () => {
    // The top bar's own key handler cancels Space / Enter for the desktop pull-downs. The menu is inside that bar's React tree.
    it('a key pressed in the menu never reaches the bar (so Space can be typed and Enter follows a link)', () => {
        mockPathname = '/dashboard';
        act(() => { useAuthStore.setState({ user: { id: 'u1', name: 'S', role: 'admin' } as any, isAuthenticated: true }); });
        const barHandler = jest.fn();
        render(<div onKeyDown={barHandler}><MobileNav onNavigate={() => {}} /></div>);
        fireEvent.keyDown(screen.getByTestId('nav-search'), { key: ' ' });
        fireEvent.keyDown(screen.getByRole('link', { name: 'Customers' }), { key: 'Enter' });
        expect(barHandler).not.toHaveBeenCalled();
    });
});

describe('Phone menu: user card', () => {
    it('shows who is signed in and logs out from a button that is always visible', () => {
        setup('/dashboard');
        expect(screen.getByText('Sainath')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('nav-logout'));
        return Promise.resolve().then(() => Promise.resolve()).then(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    });
});
