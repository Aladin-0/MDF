# New Purchase on a phone

The New Purchase entry screen has two layouts over ONE set of rules. Tablets and desktop (768px and up) keep the entry grid (`components/purchases/NewPurchaseForm.tsx`, `PurchaseItemRow.tsx`, rules in `docs/MOBILE_LAYOUT.md`, "New Purchase screen"). Phones (below 768px) get `components/purchases/mobile/`. `NewPurchaseForm` is the switch (`useIsPhone`; a neutral "Loading" until the browser answers, so nobody sees the grid flash on a phone).

## Where the rules live (never in a layout)
| File | What |
|---|---|
| `hooks/usePurchaseEntry.ts` | All state and behaviour: the form (react-hook-form + `schema`), the lines, totals, draft save / restore (same localStorage key as before, so a draft moves between layouts), scanned-bill loading and polling, purchase-order linking, duplicate-invoice check, validation, save / update / confirm |
| `lib/purchaseEntry.ts` | `schema`, `emptyItem`, `computePurchaseTotals` (every number in the totals and the payload), `lineAmount`, `isInterstateSupply`, `REVISION_REASONS` |
| `lib/purchaseLine.ts` | One line: expiry typing (`maskExpiryInput`, `finishExpiryInput`), `getExpiryStatus`, PTR / PTS defaults, `lineIssues` |
| `lib/purchaseChecks.ts` | `getPurchaseChecks`: what stops a save, in fixing order, each with where to fix it |
| `hooks/usePurchaseProductSearch.ts` | Phone medicine search (300 ms, 2 letters, same server call as the grid) |
| `hooks/useIsOnline.ts` | Shared with billing |

Keyboard-only helpers (Enter to the next cell, grid arrows, Ctrl+Enter, Ctrl+S) stay in the desktop component.

## The phone screen
- **Header card:** Party (the ledger picker to choose; the chosen party is shown in full with its group and balance and a Change button, because the picker's own selected row squeezes the name to "A..." on a phone), Invoice no and date, and one button summing up the rest ("Credit - 30 days - Main Store") that opens **More details**: credit or cash, credit days, godown, PO reference, notes.
- **Same names and order as the desktop grid (a clerk must find QTY on the phone).** The desktop columns are HSN, BATCH, EXPIRY, PKG, QTY, FREE, MRP, RATE, GST%, PTR, PTS, DISC%, AMOUNT (Pricing Details: CESS%, FREIGHT/UNIT, OTHER/UNIT, Landing Cost Floor). The phone uses exactly these words, in this order, everywhere (card, editor, accessible names). Do not rename them ("Packs", "Units per pack", "Purchase rate" were tried and confused people). Header words match too: Invoice No, Invoice Date, Purchase Type, Credit Days, Godown, PO Ref.
- **Medicines:** one card per started line (blank rows are ignored): name, batch and expiry tags with the expiry bar, the desktop row folded into labelled values (QTY, FREE, PKG, MRP, RATE, GST%, then DISC%, PTR, PTS once they have a value), `= 150 units + 30 free`, the amount, amber "still needed" chips. No fields on a card; tap it to edit.
- **Line sheet (full screen):** find the medicine (search; "Add 'x' as a new product" opens the existing drawer; a scanned bill's own reading and suggestions are offered), then the groups of desktop columns: **Item** (HSN, BATCH, EXPIRY, PKG), **Quantity** (QTY, FREE), **Price** (MRP, RATE, GST% as a radio group, PTR, PTS, DISC%), and a folded **Pricing Details** (CESS%, FREIGHT/UNIT, OTHER/UNIT). The header always shows `AMOUNT` and `LANDING COST FLOOR` while the fields scroll. Built from shadcn `Field` / `FieldLabel` / `FieldDescription` / `FieldError` / `FieldSet` (`components/ui/field.tsx`) and `RadioGroup`. A required box is only called wrong once the clerk has been in it, and then says what to do under the box (`aria-invalid` + `aria-describedby`). Expiry takes digits, shows MM/YY, is stored as the first of the month. Changes go straight into the purchase; closing a row nobody filled in removes it. The new-product drawer is a normal sheet and would open behind this full-screen one, so the line sheet steps aside while it is open.
- **Pinned bar:** medicines and units, Net payable (tap for the whole breakdown), the reason Save is off (tap to jump to the fix: party, invoice number, add a medicine, or the line with the problem), and Save. Editing a saved purchase says **Update purchase** and asks for the reason (code + 10+ characters) first.
- **Total sheet:** freight, invoice discount, ledger adjustment (sign, amount, reason) and the full breakdown (CGST + SGST, or IGST for another state; round-off).
- **Banners:** scan being read, scan failed (retry / dismiss), review notes and "View scanned bill" (all pages), linked purchase order, open orders to link, unsaved draft, near-expiry.
- Scanning a bill starts on the Invoices tab ("Tap to Scan Invoice": camera, gallery, several pages); the result opens here for review. Nothing is saved until Save.

## Rules for changes
1. A purchase rule (a total, a validation, what is sent) goes in `usePurchaseEntry` / `lib/`, with a test in `lib/__tests__`; never in `PurchaseItemRow`, `PurchaseGridForm` or a phone component.
2. Phone theme comes from `components/billing/mobile/theme.ts` (`T`) and `SheetShell`; targets >= 44px; numeric fields use `NumField` / `inputMode`.
3. Test on a phone-size browser (390 and 360px) with EVERY write blocked: a catch-all that answers every non-GET to `/api/v1/` with a stand-in (let only login / token through), then the specific stand-ins (`POST /purchases/` records the payload).
4. Tests: `components/purchases/mobile/*.test.tsx` (`testEntry.tsx` has the fake entry), `lib/__tests__/purchase*.test.ts`, `hooks/usePurchaseProductSearch.test.ts`, and the grid's `components/purchases/__tests__/NewPurchaseFormUX.test.tsx`.

## Review rules (kept from the UI/UX pass)
- Picking a medicine must update the form's own copy of the lines (`handleSelectProduct` calls `setValue('items', ...)`), or a medicine picked and saved straight away is still a blank row to the save check.
- `todayStr()` / `defaultDueStr()` are functions, not constants: a constant froze the default invoice date at page load (a tab left open overnight defaulted to yesterday).
- `usePurchaseEntry` returns `hasUnsavedWork` and `discardDraft`; both layouts use `LeavePurchaseDialog` on Cancel. `handleRemoveItem` toasts "Medicine removed" with Undo for a started line (a blank row needs none).
- `autoFocus` is used on the phone only where the next field is the obvious one (the search box when the Add sheet opens, the batch box after a medicine is picked).
- **PKG** follows `docs/PACK_DEFINITIONS.md` ("PKG on a purchase line"): whole number 1-1000, blank is an error (never 1), a note when it differs from a real catalogue size, the "Check the pack sizes" question before saving (`PackSizeConfirmDialog`, both layouts), and a server refusal opens that line on the phone. `lineIssues` includes `pkg` (after expiry, in the desktop column order).

