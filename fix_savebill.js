const fs = require('fs');
const file = 'apps/frontend/hooks/useSaveBill.ts';
let content = fs.readFileSync(file, 'utf8');
const search = `        } catch (err: any) {
            const message =
                err?.message ??
                err?.error?.message ??
                err?.detail ??
                'Failed to save bill. Please try again.';
            setError(message);
            throw err;
        }`;
const replace = `        } catch (err: any) {
            console.error(JSON.stringify({
                event: "SAVE_BILL_FAILED",
                error: err?.message || err?.detail || String(err),
                outletId: resolvedOutletId,
                draftId: activeDraftId,
                editingSaleId: state.editingSaleId,
            }));

            const message =
                err?.detail ??
                err?.message ??
                err?.error?.message ??
                'Failed to save bill. Please try again.';
            setError(message);
            throw err;
        }`;
if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
    console.log('Replaced useSaveBill catch block');
} else {
    console.log('Could not find search string in useSaveBill');
}
