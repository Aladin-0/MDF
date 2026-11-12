# Mobile layout

Every page except **billing** (`app/billing`, `components/billing`) and the **New Purchase entry screen** (`components/purchases/NewPurchaseForm.tsx`, `PurchaseItemRow.tsx`, `AddNewProductDrawer.tsx`) is designed to work on a 360-430px phone. Those two are desktop/tablet screens on purpose; do not "fix" them for phones. The rest of purchases (Invoices, Shortbook, Purchase Orders, Distributors, PO detail, revisions) is mobile-responsive like everything else.

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
