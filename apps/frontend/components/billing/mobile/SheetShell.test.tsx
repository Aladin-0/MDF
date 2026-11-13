import "@testing-library/jest-dom";
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { SheetShell } from './SheetShell';

describe('SheetShell', () => {
    // let jsdom deliver the popstate that closing a sheet's history entry causes, so one test cannot leak into the next
    afterEach(async () => { cleanup(); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); });

    it('shows the title, body and pinned footer when open', () => {
        render(<SheetShell open onClose={jest.fn()} title="Customer" footer={<button>Save</button>}><p>body text</p></SheetShell>);
        expect(screen.getByText('Customer')).toBeInTheDocument();
        expect(screen.getByText('body text')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('renders nothing when closed', () => {
        render(<SheetShell open={false} onClose={jest.fn()} title="Customer"><p>body text</p></SheetShell>);
        expect(screen.queryByText('body text')).not.toBeInTheDocument();
    });

    it('the phone Back button closes the sheet instead of leaving the page', () => {
        const onClose = jest.fn();
        render(<SheetShell open onClose={onClose} title="Customer"><p>x</p></SheetShell>);
        expect(window.history.state?.mobileSheet).toBeTruthy();   // a history entry marks the open sheet
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('with nested sheets Back closes only the top one', () => {
        const outer = jest.fn();
        const inner = jest.fn();
        render(<SheetShell open onClose={outer} title="Outer"><p>o</p></SheetShell>);
        render(<SheetShell open onClose={inner} title="Inner"><p>i</p></SheetShell>);
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(inner).toHaveBeenCalledTimes(1);
        expect(outer).not.toHaveBeenCalled();
    });

    const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    it('closing a nested sheet with a button does not close the sheet under it', async () => {
        const go = jest.spyOn(window.history, 'go').mockImplementation(() => {});
        const outer = jest.fn();
        const { rerender } = render(<>
            <SheetShell open onClose={outer} title="Outer"><p>o</p></SheetShell>
            <SheetShell open onClose={jest.fn()} title="Inner"><p>i</p></SheetShell>
        </>);
        // the inner sheet is closed by the app (a button): its history entry is removed with ONE go(-1)
        rerender(<>
            <SheetShell open onClose={outer} title="Outer"><p>o</p></SheetShell>
            <SheetShell open={false} onClose={jest.fn()} title="Inner"><p>i</p></SheetShell>
        </>);
        await tick();
        expect(go).toHaveBeenCalledTimes(1);
        expect(go).toHaveBeenCalledWith(-1);
        // the popstate caused by our own go() must be ignored
        act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
        expect(outer).not.toHaveBeenCalled();
        go.mockRestore();
    });

    it('two sheets closed in the same moment (Add to bill: Add sheet + search) are removed with a single go(-2)', async () => {
        const go = jest.spyOn(window.history, 'go').mockImplementation(() => {});
        const { rerender } = render(<>
            <SheetShell open onClose={jest.fn()} title="Search"><p>s</p></SheetShell>
            <SheetShell open onClose={jest.fn()} title="Add"><p>a</p></SheetShell>
        </>);
        rerender(<>
            <SheetShell open={false} onClose={jest.fn()} title="Search"><p>s</p></SheetShell>
            <SheetShell open={false} onClose={jest.fn()} title="Add"><p>a</p></SheetShell>
        </>);
        await tick();
        expect(go).toHaveBeenCalledTimes(1);
        expect(go).toHaveBeenCalledWith(-2);
        go.mockRestore();
    });

    it("React's dev double-run (effect, cleanup, effect) pushes ONE history entry, not two", async () => {
        const push = jest.spyOn(window.history, 'pushState');
        const go = jest.spyOn(window.history, 'go').mockImplementation(() => {});
        render(<React.StrictMode><SheetShell open onClose={jest.fn()} title="Customer"><p>x</p></SheetShell></React.StrictMode>);
        await tick();
        expect(push.mock.calls.filter((c) => (c[0] as any)?.mobileSheet)).toHaveLength(1);
        expect(go).not.toHaveBeenCalled();                // and no back-and-forth while opening
        push.mockRestore(); go.mockRestore();
    });
});
