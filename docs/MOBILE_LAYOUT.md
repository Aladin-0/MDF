# Mobile layout

Every page except the **desktop billing screen** (`app/billing`, `components/billing/*.tsx`, which has the separate phone layout below) and the **New Purchase entry screen** (`components/purchases/NewPurchaseForm.tsx` grid, `PurchaseItemRow.tsx`) is designed to work on a 360-430px phone. **New Purchase has its own phone layout too** (`components/purchases/mobile/`, switched in `NewPurchaseForm` below 768px; design in `docs/MOBILE_PURCHASE_DESIGN.md`): the 17-column grid stays the tablet/desktop screen, and purchase rules live in `hooks/usePurchaseEntry.ts` / `lib/`, never inside one of the two layouts. **Billing has its own phone layout** (`components/billing/mobile/`, switched in `app/billing/page.tsx` below 768px; design in `docs/MOBILE_BILLING_DESIGN.md`): change billing rules in the shared store / hooks / `lib/`, never inside one of the two layouts. The rest of purchases (Invoices, Shortbook, Purchase Orders, Distributors, PO detail, revisions) is mobile-responsive like everything else.

## The rules

1. **Mobile-first Tailwind.** Base classes are the phone; `sm:` (640) / `md:` (768) / `lg:` (1024) add the larger layouts. Tablet and desktop must look the same as before a mobile change.
2. **Root font size** is 18px from 640px up and 16px below it (`app/globals.css`). Don't add per-component `html` overrides.
3. **No horizontal page scroll.** Only a table's own wrapper (`overflow-x-auto`) may scroll sideways. Flex children that hold text need `min-w-0` + `truncate`/`break-words`.
4. **Tables.**
   - Daily-use lists (sales, customers, inventory, vouchers, payables ...): a stacked card list on phones (`md:hidden`) and the table from `md` up (`hidden md:block`). Same data, same row actions.
   - Wide report / ledger tables keep horizontal scroll inside a bordered wrapper, with `min-w-*` and `whitespace-nowrap` cells. Don't turn them into cards.
   - A raw `<table>` must always sit inside an `overflow-x-auto` wrapper (`components/ui/table.tsx` already does).
5. **Toolbars and filters:** `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`; filters `w-full sm:w-auto`; the primary action `w-full sm:w-auto`.
6. **Grids:** `grid-cols-1` or `grid-cols-2` on a phone, more from `sm`/`lg`. Never an unconditional `grid-cols-3` or more for content.
7. **Fixed widths** (`w-[260px]`, `min-w-[300px]`) become `w-full sm:w-[260px]`.
8. **Popups:** use `ModalShell` or `ui/dialog` (both already fit a phone: `dvh`, side margin, scrolling body). A custom overlay must use `dvh` (not `vh`/`h-screen`), `w-full`, `p-3 sm:p-6`, a scrolling body and stacked / full-width footer buttons. Fixed bottom bars add `pb-[env(safe-area-inset-bottom)]`.
9. **Touch targets** of icon-only buttons are at least ~36px on a phone (`h-9 w-9 sm:h-8 sm:w-8`).
10. **Already handled by shared pieces (don't redo per page):** `ui/dialog`, `ui/alert-dialog`, `ModalShell`, `ui/popover`, `ui/select`, `ui/dropdown-menu` (never wider than the screen), `ui/tabs` (scrolls sideways), `ui/date-range-picker` (one month on phones), `TablePagination` (no page-number strip on phones), the dashboard shell (hamburger drawer below `lg`), the `.no-scrollbar` utility.

## Checking a page

Open it at 360px wide (browser devtools device mode, or a Playwright viewport of 390×844) and check: no sideways page scroll, every action reachable, forms and modals scroll with their buttons visible, text doesn't collide.

## New Purchase screen (desktop / tablet) design rules

The entry form is a dense desktop/tablet screen; these rules keep it consistent (it is checked at 1440 and 1024 px, never made phone-first):
- **Theme colour only.** Save, focus rings, the selected row and links use `primary` / `ring` / `blue-*`, like the rest of Purchases. No hard-coded violet or `#7c3aed`.
- **Labels are 12px (`text-xs font-semibold text-slate-700`) and stacked above their field in both header rows**, so the fields line up on the same four-column grid. No 10-11px grey-on-grey text for anything the clerk must read; 11px is only for the unit hints under a cell.
- **The Amount column is pinned** (`sm:sticky sm:right-[60px]`, next to the expand and remove columns) so a line total is visible on a 1024px tablet without scrolling sideways. Every pinned cell and row background must be **opaque** (no `bg-slate-50/40`), or the columns scrolling underneath show through.
- **Errors appear on the form.** Saving with nothing entered marks the missing party / invoice number and shows "Add at least one medicine" above the table, and moves the cursor to the first missing field; it does not rely on a toast (a toast covers the fixed Save bar for several seconds). Errors clear as soon as the field is valid.
- Stock and quantities shown in the product list go through `formatStockQty` (no `11.866666666666667`).
- Tests: `components/purchases/__tests__/NewPurchaseFormUX.test.tsx`.
- **Many rows: the page scrolls, the table never gets its own scroll box.** No `max-h` / `overflow-auto` on the table wrapper. From 1380px (the table needs 1308px) nothing scrolls sideways (`overflow-x-clip`); below that only the sideways scroll remains (`overflow-x-auto`). The column header is `sticky top-[var(--app-header-h,0px)]`: `app/dashboard/layout.tsx` publishes the pinned top bar's height as `--app-header-h` and its content wrapper uses `overflow-x-clip` (not `-hidden`, which made it a scroll container and stopped every `sticky` inside from pinning). A button under the last row (`Add another medicine`) saves scrolling back up.
- **Review rules (UI/UX + Web Interface Guidelines pass):** every grid cell has an `aria-label` ("Batch number, medicine 3"), `autoComplete="off"`, and no spell-check on codes (batch, HSN, expiry); decorative icons are `aria-hidden`; an expired / under-90-day batch says so in words under the expiry box (never colour or a tooltip alone); choosing a party hands focus to Invoice No; a refused save puts the cursor on the first bad cell (`focusFirstInvalid` in the hook); the near-expiry notice is a chip in the Medicines bar, never a banner above the form (it shoved the table down while typing); error messages say what to do ("Enter the batch number"), never "required"; **Cancel with typed-in work asks first** (`LeavePurchaseDialog`: keep editing / save draft & leave / discard) and **removing a typed-in medicine can be undone** (toast Undo); toasts sit above the pinned Save bar (the form sets `data-purchase-footer` on `<html>`; `globals.css` lifts `[data-toast-viewport]` from 1280px).

