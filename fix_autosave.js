const fs = require('fs');
const file = 'apps/frontend/hooks/useAutosaveDraft.ts';
let content = fs.readFileSync(file, 'utf8');
const search = `            } catch (err: any) {
                console.error('Failed to autosave draft', err);
                useBillingStore.getState().setDraftSaveStatus(draft.id, 'error');
                // Block retry loop to avoid spamming the same failing payload
                lastSavedStringRef.current = currentString;
            }`;
const replace = `            } catch (err: any) {
                console.error(JSON.stringify({
                    event: "AUTOSAVE_FAILED",
                    error: err?.message || err?.detail || String(err),
                    draftId: draft.id,
                    outletId: payload.outlet,
                }));
                useBillingStore.getState().setDraftSaveStatus(draft.id, 'error');
                // Block retry loop to avoid spamming the same failing payload
                lastSavedStringRef.current = currentString;
            }`;
if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
    console.log('Replaced useAutosaveDraft catch block');
} else {
    console.log('Could not find search string in useAutosaveDraft');
}
