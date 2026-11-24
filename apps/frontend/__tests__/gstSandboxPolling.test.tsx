import '@testing-library/jest-dom';
import React from 'react';
import { act, render } from '@testing-library/react';
import SandboxPage from '@/app/gst/sandbox/page';
import { gstApi } from '@/lib/apiClient';

jest.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/gst/sandbox' }));
jest.mock('@/lib/apiClient', () => ({
    gstApi: {
        getSandboxStatus: jest.fn(),
        getSandboxGstr2bStatus: jest.fn(),
        syncSandboxGstr2b: jest.fn(),
    },
}));

it('stops asking for the GSTR-2B sync status when the page is closed (it kept polling every 3 s)', async () => {
    jest.useFakeTimers();
    try {
        (gstApi.getSandboxStatus as jest.Mock).mockResolvedValue({ auth_status: 'AUTHENTICATED', provider_mode: 'test' });
        (gstApi.getSandboxGstr2bStatus as jest.Mock).mockResolvedValue({ status: 'IN_PROGRESS' });
        const { unmount } = render(<SandboxPage />);
        await act(async () => { await Promise.resolve(); await Promise.resolve(); });
        await act(async () => { jest.advanceTimersByTime(6100); });
        const whileOpen = (gstApi.getSandboxGstr2bStatus as jest.Mock).mock.calls.length;
        expect(whileOpen).toBeGreaterThanOrEqual(2);                 // it does poll while the sync runs
        unmount();
        await act(async () => { jest.advanceTimersByTime(30000); });
        expect((gstApi.getSandboxGstr2bStatus as jest.Mock).mock.calls.length).toBe(whileOpen);
    } finally {
        jest.useRealTimers();
    }
});
