/**
 * Implementations of the `command` actions referenced from config/shortcuts.ts.
 * Kept separate from the registry so the registry stays plain data, and separate from the
 * React listener so it can be unit-tested.
 */
import { useBillingStore } from '@/store/billingStore';

export interface ShortcutCommandContext {
    openHelp: () => void;
    toggleHelp: () => void;
    notify: (message: string) => void;
}

/** Open bills in the same order the tab strip shows them (oldest first). */
export function orderedBillIds(): string[] {
    const { drafts } = useBillingStore.getState();
    return Object.values(drafts)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map((d) => d.id);
}

/** Focus an element tagged with data-shortcut-target (or the first field inside a tagged wrapper). */
export function focusTarget(name: string): boolean {
    const host = document.querySelector<HTMLElement>(`[data-shortcut-target="${name}"]`);
    if (!host) return false;
    const field = host.matches('input,textarea,select,button')
        ? host
        : host.querySelector<HTMLElement>('input,textarea,select,button');
    if (!field) return false;
    field.focus();
    (field as HTMLInputElement).select?.();
    return true;
}

function stepBill(offset: 1 | -1): void {
    const ids = orderedBillIds();
    if (ids.length < 2) return;
    const { activeDraftId, switchDraft } = useBillingStore.getState();
    const current = Math.max(0, ids.indexOf(activeDraftId ?? ''));
    switchDraft(ids[(current + offset + ids.length) % ids.length]);
}

export function runShortcutCommand(command: string, ctx: ShortcutCommandContext): void {
    if (command === 'help') {
        ctx.toggleHelp();
        return;
    }

    if (!command.startsWith('billing.')) return;

    // The billing terminal is locked behind a staff PIN: shortcuts must not act on bills until it is unlocked.
    const store = useBillingStore.getState();
    if (!store.isPinVerified) return;

    const [name, arg] = command.split(':');

    switch (name) {
        case 'billing.new': {
            const id = store.createDraft();
            if (!id) ctx.notify('You can have at most 10 open bills. Close one first.');
            return;
        }
        case 'billing.close': {
            const ids = orderedBillIds();
            if (ids.length <= 1) {
                ctx.notify('This is your only open bill, so it cannot be closed.');
                return;
            }
            const activeId = store.activeDraftId;
            if (!activeId || !store.drafts[activeId]) return;
            const itemCount = store.drafts[activeId].cart.length;
            if (itemCount > 0 && !window.confirm(`Close this bill? It has ${itemCount} item(s) that will be discarded.`)) {
                return;
            }
            store.closeDraft(activeId);
            return;
        }
        case 'billing.next':
            stepBill(1);
            return;
        case 'billing.prev':
            stepBill(-1);
            return;
        case 'billing.jump': {
            const index = Number(arg) - 1;
            const target = orderedBillIds()[index];
            if (target) store.switchDraft(target);
            else ctx.notify(`Bill ${arg} is not open.`);
            return;
        }
        case 'billing.focusMedicine':
            focusTarget('medicine-search');
            return;
        case 'billing.focusCustomer':
            focusTarget('customer-search');
            return;
        case 'billing.lock':
            store.setIsPinVerified(false);
            return;
        case 'billing.counterBill':
            // wholesale sells to one named party (a person or a business): no counter bill
            if (store.activeDraftId && store.drafts[store.activeDraftId]?.saleType === 'WHOLESALE') {
                ctx.notify('Counter bills are for retail bills. A wholesale bill needs a customer.');
                return;
            }
            // a generic cash sale: no customer, no patient, no walk-in name; carry on with the medicines
            store.startCounterBill();
            focusTarget('medicine-search');
            return;

        default:
            return;
    }
}
