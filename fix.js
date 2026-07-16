const fs = require('fs');
const file = 'apps/frontend/hooks/useLoadDrafts.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `                // ──────────────────────────────────────────────────────────────────
                // If the store already has drafts (e.g. quotation prefill from the
                // QuotationsList page), do NOT overwrite them with server data.
                // The server drafts will be loaded next time the page is visited
                // from a clean state.
                // ──────────────────────────────────────────────────────────────────
                const currentDrafts = useBillingStore.getState().drafts;
                if (Object.keys(currentDrafts).length > 0) {
                    setIsLoaded(true);
                    return;
                }`;

const replace1 = `                const currentDrafts = useBillingStore.getState().drafts;
                const currentActiveId = useBillingStore.getState().activeDraftId;`;

content = content.replace(target1, replace1);

const target2 = `                if (!Array.isArray(data) || data.length === 0) {
                    createDraft();
                    setIsLoaded(true);
                    return;
                }`;

const replace2 = `                if (!Array.isArray(data) || data.length === 0) {
                    if (Object.keys(currentDrafts).length === 0) {
                        createDraft();
                    }
                    setIsLoaded(true);
                    return;
                }`;

content = content.replace(target2, replace2);

const target3 = `                const newDrafts: Record<string, DraftBill> = {};
                let firstId: string | null = null;

                data.forEach((draft: any) => {
                    if (!firstId) firstId = draft.id;`;

const replace3 = `                const newDrafts: Record<string, DraftBill> = { ...currentDrafts };
                let firstId: string | null = currentActiveId;

                data.forEach((draft: any) => {
                    if (newDrafts[draft.id]) return;
                    if (!firstId) firstId = draft.id;`;

content = content.replace(target3, replace3);

fs.writeFileSync(file, content, 'utf8');
