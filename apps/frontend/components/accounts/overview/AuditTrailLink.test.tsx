import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AuditTrailLink } from './AuditTrailLink';

let mockAllowed: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ hasPermission: (p: string) => mockAllowed.includes(p) }) }));

it('the super admin gets a link to the Audit Trail', () => {
    mockAllowed = ['view_audit_trail', 'view_accounts'];
    render(<AuditTrailLink />);
    expect(screen.getByRole('link', { name: /open the audit trail/i })).toHaveAttribute('href', '/admin/audit');
});

it('a manager (who can open the Accounts Dashboard) sees no audit information at all', () => {
    mockAllowed = ['view_accounts'];
    const { container } = render(<AuditTrailLink />);
    expect(container).toBeEmptyDOMElement();
});
