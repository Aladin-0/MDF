/**
 * The "Edit all batches" grid on the product page: every batch of a product is a row of editable cells, changed
 * together and saved with one button. Pure functions (no React), built on the single-batch rules in `batchEdit.ts`,
 * so the grid and the Edit Batch form can never disagree about what is valid or what a change is.
 *
 * The server is still the authority; it writes only the fields we send and refuses a bad value per batch.
 */
import {
    buildBatchPatch, buildUndoPatch, diffBatchForm, toForm, validateBatchForm,
    type BatchFormField, type BatchFormValues, type Change, type EditableBatch,
} from '@/lib/batchEdit';

/** The columns a person edits in the grid, in the order Tab visits them. (Mfg date, pack type and unit stay in Edit Batch.) */
export const GRID_FIELDS = ['batchNo', 'expiryDate', 'packSize', 'mrp', 'purchaseRate', 'landingRate', 'rackLocation'] as const;
export type GridField = (typeof GRID_FIELDS)[number];
export type GridErrors = Partial<Record<GridField, string>>;

export interface GridBatch extends EditableBatch { id: string }

/** Everything wrong with a row, as { column: message }. Only the grid's own columns (a missing pack unit is not the grid's to fix). */
export function gridErrors(form: BatchFormValues, opts: { showRates?: boolean } = {}): GridErrors {
    const all = validateBatchForm(form, opts);
    const out: GridErrors = {};
    for (const f of GRID_FIELDS) if (all[f]) out[f] = all[f];
    if (all.mfgDate && !out.expiryDate) out.expiryDate = 'Expiry is before the mfg date';   // mfg is not a column: blame the expiry cell
    return out;
}

/** Ids of the rows whose batch number repeats another row's (case and spaces ignored): the server refuses a clash per product. */
export function duplicateBatchNos(forms: Record<string, BatchFormValues>): Set<string> {
    const seen = new Map<string, string[]>();
    for (const [id, f] of Object.entries(forms)) {
        const key = f.batchNo.trim().toLowerCase();
        if (key) seen.set(key, [...(seen.get(key) ?? []), id]);
    }
    const dup = new Set<string>();
    seen.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => dup.add(id)); });
    return dup;
}

export interface RowSave {
    id: string;
    /** The batch number as it was, for messages. */
    label: string;
    changes: Change[];
    /** ONLY the changed fields. */
    patch: Record<string, string | number | null>;
    /** The patch that puts the old values back. */
    undo: Record<string, string | number | null>;
}

/** The rows that really changed (a cell edited and put back is not a change), with what to send for each. */
export function changedRows(batches: GridBatch[], drafts: Record<string, BatchFormValues>): RowSave[] {
    const rows: RowSave[] = [];
    for (const b of batches) {
        const draft = drafts[b.id];
        if (!draft) continue;
        const initial = toForm(b);
        const changes = diffBatchForm(initial, draft);
        if (changes.length === 0) continue;
        rows.push({ id: b.id, label: initial.batchNo, changes, patch: buildBatchPatch(initial, draft), undo: buildUndoPatch(initial, draft) });
    }
    return rows;
}

export const touchesPackSize = (rows: RowSave[]) => rows.some((r) => r.changes.some((c) => c.field === 'packSize'));

/** True when the batches do not all share one pack size: the state that caused the "UI offers Loose, server refuses" bug. */
export function packSizesDiffer(batches: Pick<GridBatch, 'packSize'>[]): boolean {
    return new Set(batches.map((b) => Number(b.packSize ?? 1))).size > 1;
}

/**
 * A column copied from Excel or Sheets arrives as lines (and, for a wider selection, tab-separated cells). Returns the
 * first cell of each line, or [] when it is a single value (a normal paste into one cell).
 */
export function parsePastedColumn(text: string): string[] {
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();    // a trailing newline is not a row
    if (lines.length < 2) return [];
    return lines.map((l) => l.split('\t')[0].trim());
}

/** Is the MRP below the cost (landing, else purchase)? Allowed, but worth a warning. */
export function sellsBelowCost(f: BatchFormValues): boolean {
    const cost = Number(f.landingRate) || Number(f.purchaseRate) || 0;
    return Number(f.mrp) > 0 && cost > 0 && Number(f.mrp) < cost;
}

export type { BatchFormField };
