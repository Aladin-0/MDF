# Mobile billing: UX design (phone, 360-430px)

Status: BUILT (phases 0-5 minus real-phone polish; see section 7). Written as a design before any code. Billing stays **one route (`/billing`) and one set of logic** (`billingStore`, `useCheckout`, `useSaveBill`, `payloadBuilders`, pack rules, the search API). Below 768px the page renders a **phone layout** (`components/billing/mobile/*`); tablet and desktop keep the current screen untouched. See `docs/MOBILE_LAYOUT.md` for the rest of the app.

## 1. What the current screen is (so nothing is forgotten)

Desktop/tablet: `GlobalNavigation` + a 46px draft-tab strip, then a left column (header strip with ~10 fields, a dense editable cart grid up to 1,200px wide, a quick-add widget) and a right rail (Bill Summary, margin block, dark payment dock). Below `lg` the rail collapses into a fixed dark payment dock plus a "Summary" dialog and the cart scrolls sideways. It is built for a keyboard (Alt+N/W/M/P/J/C, Ctrl+Enter, arrow keys, Enter-chains) and for tablets.

Everything the phone UI must cover (from the code inventory):

| Area | Features |
|---|---|
| Session | 4-digit staff PIN gate, lock / switch cashier, max 10 draft bills, drafts autosave to the server (2s) and restore, `billsToday`, offline banner (saving is impossible offline) |
| Mode | Retail / Wholesale (wholesale: named customer only, PTR/PTS rates, GST on top, no round-off, credit only, transporter / e-way fields); Invoice / Quotation (+ Convert to invoice); Edit/revise (`/billing?edit=<id>`, reason modal, optimistic-lock stamp); pre-filled from quotation / Order Again (banners) |
| Party | Customer (search name/mobile, add new, Counter bill, Non-valued customer, walk-in name), "Billing for" family member (retail), doctor (search, add new), hospital, Rx number, Rx image upload, e-way fields, invoice date, billed-by chip |
| Search | name words any order, `C,salt`, `L+price` (about / range / `<` `>` / `=`), barcode (hardware scanner + camera), substitutes, in-stock first, no-stock -> Add to Shortbook |
| Cart | per line: product, composition, batch, expiry colour/status, MRP (and PTR/PTS wholesale), qty strips + loose (only when the pack allows loose), free qty (wholesale), discount % or Rs, amount, loss-sale lock, low/out/expired badges; margin line (admin/manager) |
| Totals | item discounts, bill discount (% and Rs linked), taxable, CGST+SGST or IGST, round-off, NET PAYABLE, margin block |
| Payment | Cash / UPI / Card / Credit / Split (4 inputs + Fill + exact-match check); credit needs a customer and respects the limit; Schedule H data rule; loss-sale lock; Collect / Save on credit / Save quotation |
| After save | success screen: invoice no., amount, mode, billed by; print (thermal 80/57mm or A4), New bill, View invoice |

### Existing problems found (do not copy them to the phone; fix in the shared code where marked)

1. **Margin leak:** the line editor shows cost and margin to every role; only the cart/rail are gated by `canViewBillingMargins`. Phone gates it everywhere (shared fix in `InlineRowEditor` too).
2. **Remove has no confirm and no undo.** Phone: remove with an Undo snackbar.
3. **Schedule H gate mismatch:** the page only requires doctor/patient data for H1/X/C/Narcotic, the server also requires it for G and H, so a plain-H sale passes the screen and is refused at save. Phone surfaces the server rule up front (shared fix in `useCheckout`/store totals, with a test).
4. **`alert()` for blocks** (stock, loss sale, revision reason). Phone uses inline messages.
5. **No cash-received / change** is shown (`cashTendered` is never set). Phone adds it as an optional helper, not a rule.
6. **PDF button and WhatsApp button are no-ops**, `TransactionStrip` is dead code, the retail rate field in the row editor is unreachable dead code. Phone replaces these with Web Share (invoice text/link) and real print.
7. Order Again pushes `/dashboard/billing`: harmless (a redirect to `/billing` exists in `next.config.js`); `quoteId` in the convert URL is never read (state travels through the store).
8. Edit mode has **no visible "you are editing" banner**. Phone shows one.

## 2. Design principles

- **Thumb first.** Primary actions live in the bottom 40% of the screen. One sticky bottom bar (total + the one main button). No tiny icons: every target >= 44x44px, 8px between neighbours, `inputmode="decimal"` / `"numeric"` for every number.
- **The fast path is 3 taps per medicine:** search -> tap result -> `+ Add`. A repeat customer's usual retail bill should take ~10 taps, no typing beyond the medicine name.
- **One thing at a time.** The bill is a list; everything else (customer, doctor, line editing, payment) opens as a **bottom sheet** or a full-screen step, never as a cramped inline form. Progressive disclosure: optional fields (hospital, Rx, e-way) sit behind "More details".
- **Never lose the bill.** Android Back closes the open sheet before it leaves the page (history state per sheet). Drafts keep autosaving. Leaving search or a sheet never clears the cart.
- **Same rules, same numbers.** Totals, GST, rates, loose rules and payload come from the shared store/builders. The phone only changes presentation. A contract test builds the same cart through both layouts and asserts the same payload.
- **Reuse the app's look:** theme tokens (`primary` blue, slate neutrals, `muted`), the app font, `ModalShell`/`ui/sheet` patterns, lucide icons (no emoji). The dark payment dock of the tablet becomes the dark bottom bar. Min body text 12px, labels visible above fields (not placeholder-only), expiry and stock states use colour **and** text/icon.
- **Safe areas and keyboard:** bottom bar respects `env(safe-area-inset-bottom)` and hides while the on-screen keyboard is up (visualViewport); content gets bottom padding so nothing hides behind the bar.
- **Motion:** short (150-250ms) sheet slide and pressed-state feedback; respect `prefers-reduced-motion`.

## 3. Screens

### 3.1 Bill (home)

```
┌───────────────────────────────┐
│ ≡  Bill 2 ▾ · ₹1,038   Retail ▾│  top bar 48px: menu, bill switcher, sale type, ⋮
├───────────────────────────────┤
│ [Walk-in ▾] [Self ▾] [Dr —] [+]│  chips (scroll sideways, each opens a sheet)
├───────────────────────────────┤
│ 🔍 Search medicine…      [▦ scan]│  sticky, 48px; tap opens Search view
├───────────────────────────────┤
│▌DOLO 650 TAB 15'S          ₹32│  one card per line, expiry colour bar left
│  PARACETAMOL · B123 · 06/27   │
│  QTY [2 strips]  10% off      │  read-only qty; tap card = edit sheet
│▌LOSAR 50MG TAB          ₹178  │
│  …  ⚠ Low stock               │
│  (list scrolls)                │
├───────────────────────────────┤
│ 3 items · 5 packs   NET ₹1,038 ▴│  dark bar; tap = totals sheet
│ [        Collect ₹1,038      ]│  main button (label follows mode)
└───────────────────────────────┘
```

- **Top bar:** hamburger (the same nav drawer as the rest of the app), **bill switcher** chip ("Bill 2 · ₹1,038 ▾" opens the Bills sheet), sale-type chip (Retail/Wholesale), ⋮ menu (Invoice/Quotation, Margin view for admin/manager, Counter bill, Non-valued customer, Lock terminal, Close this bill).
- **Banners** (under the bar, one at a time, dismiss-free): amber "Editing INV-2026-001742", blue "Pre-filled from Quotation QT-…", green "Pre-filled from Invoice … · 2 items need review", red offline bar.
- **Chips row:** `Customer` (name or Walk-in / Counter bill + a red "Due ₹x" / "Limit ₹x" pill), `Billing for` (retail, when a customer is set), `Doctor` (retail; red dot when Schedule H needs it), `More` (hospital, Rx no., Rx photo; wholesale: transporter / e-way). Each chip shows its value, or "+ Add".
- **Cart cards:** left colour bar = expiry state, badges (Out of stock, Expired, Low stock, "Below cost"), a read-only **QTY** chip in words (`2 strips`, `1 strip + 3 loose`, `3 bottles`; the card has NO steppers or number fields, so it cannot be mistaken for an "add quantity" control; quantity is changed only in the editor you open by tapping the card), discount badge, amount. Margin line ("Landing ₹x · Profit ₹y") only for admin/manager with margin view on. **No swipe gestures** (they clash with system back); remove lives in the line editor with an Undo snackbar.
- **Empty state:** large Search and Scan buttons plus the three shortcuts ("C,salt", "L+price", "scan").
- **Bottom bar:** left: items, packs, NET PAYABLE (tap to open the totals sheet). Right: the main button. It is disabled with a one-line reason above it ("Add items", "Customer needed for credit", "Doctor details needed (Schedule H)", "Below cost on 1 line: tap to fix").

### 3.2 Search view (full screen)

Opens from the search bar; the keyboard is already up.

```
┌───────────────────────────────┐
│ ←  [ losar            ✕ ] [▦] │  input 48px, scan button, ← back (cart untouched)
│ L+175 price · C,salt · scan   │  tips chips: tap to insert the prefix
├───────────────────────────────┤
│ LOSAR 50MG TAB 15'S    ₹178.31│
│ LOSARTAN POTASSIUM · 15 tabs  │
│ ● 24 in stock · exp 08/27     │
│ [Substitutes]        [ + Add ]│  big row, two clear actions
│ …                             │
└───────────────────────────────┘
```

- Results: name, composition, pack, price (the **matched** price on a price search), stock chip (green "N in stock" / red "Out of stock"), nearest expiry. In-stock first (server).
- **Substitutes** button replaces the A key: the list switches to "Substitutes for X · same salt" with Same strength / Different strength / Different form badges and a Back chip.
- **Out of stock:** the row shows "Add to Shortbook" (permission-gated) instead of `+ Add`.
- **Add sheet** (bottom sheet) after tapping `Add` / `Add more`, laid out as numbered steps on a slate background so the parts are easy to tell apart: **1 Choose batch** (full-width selectable cards: radio, batch no, coloured expiry chip, stock chip, price; expired / empty are dashed and disabled; a single valid batch is pre-selected), **2 How many?** (tinted panel: big qty stepper, loose stepper only when `allowsLoose`, wholesale PTS / PTR / MRP chips, discount %), a dark **Line total** bar and a green **Add to bill** button. Stock excess blocks inline in red (no `alert()`).
- **One way to add, one Add button.** Search results have a single `Add` button (the row itself is not a second button); the Add sheet has a single `ADD TO BILL`, which goes straight back to the bill (no second "add & search" button, no extra Done tap). Adding another medicine is one tap on the search bar. A medicine **already in the bill** is tagged `In bill · 2 strips` and its button reads `Add more`; the Add sheet then says "Already in the bill: 2 strips. This adds more to it." (the store sums the quantity of the same batch). The new cart card gets the product's batches from the cache the Add sheet just filled, so there is no network wait.
- **Barcode:** hardware / Bluetooth scanner types into the search input and presses Enter (existing behaviour). The `scan` button opens the **camera scanner** (full screen, torch toggle, "Enter manually"); a recognised known barcode opens the Add sheet directly, an unknown one says so and offers "Search by name".

### 3.3 Line editor (bottom sheet)

Tap a cart card. Fields: batch (chips), qty strips, loose (if allowed), discount with `%` / `Rs` toggle, wholesale: F-qty, F-loose, PTR, PTS. Footer: sell amount; cost and margin **only** for admin/manager. Buttons: `Save`, `Remove` (red, outlined; shows an Undo snackbar). Save is blocked with an inline message for: discount out of range, qty 0, "Loss-making sale prevented" (shows the cost basis rule in words).

### 3.4 Totals sheet (tap the bottom bar's total)

All desktop lines: item count, item discounts, **bill discount** (% and Rs inputs, linked), taxable, CGST+SGST or IGST (with place of supply note), round-off (retail only), NET PAYABLE, margin block (admin/manager, toggle). Read-mostly; only the bill discount is editable.

### 3.5 Payment (a short bottom sheet: Collect -> tap how they pay -> done)

Changed after the first on-device test: the full-screen payment page with a "Received" amount and a second Collect button was too many steps.

```
┌───────────────────────────────┐
│ Collect ₹1,038.00          ✕  │  title carries the total
│ Tap how the customer is paying│
│ [ Cash ] [  UPI  ] [ Card ]   │  one tap = choose the mode AND save the bill
│ [ On credit   Asha · due ₹1,000 ]│  needs a customer (asks to pick one if missing)
│ [ Split between modes      ▾ ]│  only this one expands (4 inputs, Fill remaining, Collect)
└───────────────────────────────┘
```

- **Retail** (plain sale): bottom bar `Collect ₹X` opens this sheet; one tap on Cash / UPI / Card / On credit saves. No "Received" amount and no change calculation (removed on request). The sheet opens as plain Cash and clears any old `cashTendered`.
- **Wholesale** (always credit), **quotation** and **edit** (keeps the bill's payment): nothing to ask, so the bottom bar saves directly (`needsPaymentStep` false in `collectState.ts`). Edit mode shows the reason sheet first; it lives in `MobileBilling`.
- Failing checks (Schedule H details, loss-making line, offline) are listed at the top of the sheet, each tappable to the fix, and the mode buttons stay off until they are fixed. Credit / split rules only apply once that mode is chosen.
- A mode tap writes the method to the store and the save runs on the next render (so `useCheckout` sees the new method).

### 3.6 Success (full screen)

Tick, "Bill saved", invoice number, amount, payment mode, time, billed by. Buttons: **Print** (opens the existing preview: thermal 80/57mm or A4), **Share** (Web Share API with the invoice text/link; falls back to copy link; WhatsApp deep link as a second option), **New bill**, **View invoice**.

### 3.7 Sheets for the party fields

- **Customer sheet:** search box (name/mobile, debounced), recent results, `Add new customer` (the existing form as a full-height sheet), retail-only `Counter bill` (there is no name-only "Non-valued customer": a bill is a Counter bill or a customer bill). Selected state shows phone, address, GSTIN, Due, Limit (retail) / DL no., Limit, Out (wholesale).
- **Billing-for sheet (retail):** Self + family members as large radio rows, `Add family member` (relation chips, new vs link existing).
- **Doctor sheet:** search name / reg no, `Add new doctor` (full-height form).
- **More details sheet:** hospital, Rx number, `Add Rx photo` (camera or gallery, preview, remove); wholesale + e-way setting: transporter GSTIN, distance, mode, vehicle type, vehicle no; invoice date (invoice mode).
- **Bills sheet (drafts):** list of up to 10 drafts (label, customer, amount, saved status), `New bill`, close buttons (confirm if items exist). Replaces the tab strip.
- **PIN:** the existing 4-digit pad (already phone friendly); the avatar/billed-by chip in the menu locks the terminal.

## 4. Architecture

- `app/billing/page.tsx` keeps the PIN gate, hydration, drafts loading, autosave and `EditSaleHydrator`, then renders `<MobileBilling/>` when `useIsPhone()` (client-side `matchMedia('(max-width: 767px)')`, decided after mount; a neutral skeleton before) else the current layout. Tablet/desktop code is not edited beyond the extractions below.
- **Phase 0 (no visible change):** move logic out of `MainInvoiceWorkspace` into shared code, with tests proving the numbers are identical: `lib/cartLine.ts` (`buildCartLine`, `stockBlock`), `hooks/useMedicineSearch.ts` (query, results, substitutes, barcode scan). The desktop component then calls them.
- **New files:** `components/billing/mobile/` : `MobileBilling`, `MobileTopBar`, `PartyChips`, `CustomerSheet`, `BillingForSheet`, `DoctorSheet`, `MoreDetailsSheet`, `BillsSheet`, `MobileSearch` (+ `SearchResultRow`, `AddLineSheet`, `QtyStepper`, `BatchChips`, `BarcodeScanner`), `CartList` / `CartLineCard`, `LineEditorSheet`, `SummaryBar`, `TotalsSheet`, `PaymentView`, `SuccessView`, `SheetShell` (one bottom-sheet primitive with focus trap, Back-button handling, safe areas). Camera scanning uses the browser `BarcodeDetector` where available and a small fallback library otherwise (to be approved when added).
- **Rules that stay shared:** `useCheckout`, `useSaveBill`, `getDraftTotals`, `payloadBuilders`, `allowsLoose`, credit / Schedule H / loss-sale checks, permissions (`canViewBillingMargins`, `create_bills`).
- **Test ids** listed in the inventory (`checkout-button`, `grand-total-amount`, `invoice-success`, ...) are reused on the phone screens so end-to-end tests work for both layouts.

## 5. Build phases

0. Extractions + shared fixes (margin gate in the editor, Schedule G/H rule, tests). Desktop unchanged (pixel + unit proof).
1. Phone shell: top bar, chips (read-only), cart cards, line editor, bottom bar, totals sheet.
2. Search view, Add sheet, substitutes, hardware barcode.
3. Party sheets, Bills (drafts) sheet, edit-mode banner + reason sheet, quotation mode, wholesale fields.
4. Payment, success (print/share).
5. Camera scanner, polish, real-phone testing (360 and 390 widths, landscape, large text, offline).

## 6. Checklist before it ships

- [ ] Every feature in section 1 reachable on a 360px phone; no horizontal scroll; every target >= 44px; no hover-only controls.
- [ ] Same cart -> same payload, totals and server result on phone and desktop (contract test).
- [ ] Tablet (820px) and desktop (1440px) pixel-identical to before.
- [ ] Margin data hidden from roles that cannot see it, everywhere.
- [ ] Back button, reload mid-bill (draft restores), offline, lock/PIN, edit mode, quotation, wholesale, Schedule H, credit limit, split mismatch all tested.

## 7. What was built (file map) and what is still open

Switch: `app/billing/page.tsx` renders `components/billing/mobile/MobileBilling.tsx` when `useIsPhone()` (< 768px) is true after the PIN gate; the success screen is `SuccessView`; tablet and desktop render the original screen.

| Area | Files (all `components/billing/mobile/`) |
|---|---|
| Shell | `MobileBilling`, `MobileTopBar`, `MobileBanners`, `PartyChips`, `BillsSheet` |
| Party sheets | `CustomerSheet`, `BillingForSheet`, `DoctorSheet`, `MoreDetailsSheet` |
| Search | `MobileSearch`, `SearchResultRow`, `AddLineSheet`, `BarcodeScanner` (camera via `BarcodeDetector`) |
| Cart | `CartList`, `CartLineCard`, `LineEditorSheet`, `SummaryBar`, `TotalsSheet` |
| Payment | `collectState` (button label / reason), `PaymentView`, `RevisionReasonSheet`, `SuccessView` |
| Primitives | `SheetShell` (+ `hooks/useBackToClose`, stack-aware), `QtyStepper`, `hooks/useIsPhone` |
| Shared logic (also used by the desktop screen) | `lib/cartLine.ts`, `hooks/useMedicineSearch.ts`, `lib/scheduleRules.ts`, `lib/searchSyntax.ts` |

Fixed in shared code on the way: line editor cost/margin hidden for roles without margin access; one `CONTROLLED_SCHEDULES` list (G, H, H1, X, C, Narcotic) used by the screen and mirrored from the server.

Still open: verification on real phones (iOS Safari has no `BarcodeDetector`, so the camera scanner shows its fallback message there; a Bluetooth/hardware scanner works everywhere), the edit banner shows the invoice number only if `EditSaleHydrator` stores `sourceInvoiceNo`, quotations convert to invoice but the quotation list's "Open in billing" path was not re-tested on a phone, "Order again" from a customer page opens the phone layout like any other bill.

## 8. Theme: the phone looks like the desktop billing screen

After the on-device test the first phone design was judged "not close to our project theme" and low contrast. It was reviewed against the real desktop/tablet billing screens (screenshots driven with Playwright, with the PIN lookup, draft autosave and the final save answered by test stand-ins so nothing is written) and re-skinned. The rules live in `components/billing/mobile/theme.ts` (constant `T`); use it, not hand-written colours.

- **Sky `#0EA5E9`** is the one action / selection colour (search border, CTAs, selected batch / mode), exactly as on desktop; sky-700 for sky text on light. No green Add button, no second blue.
- **Navy dock** (slate-900 surface, slate-800 panels, white text, slate-300 secondary): the bottom total bar, the payment sheet (`SheetShell tone="dark"`), the Add sheet's line total and the margin / NET PAYABLE blocks, like the desktop payment dock.
- **Light screens:** slate-100 page (the tab band colour), white cards with slate-300 borders, slate-200 header bands for cart / sheet steps (the desktop table header), slate-900 text, slate-700 labels. Never slate-500 labels on light or slate-400 on navy.
- **Desktop details carried over:** 6px expiry bar on cart rows and batch cards, monospace tags `B: <batch>` / `Exp: MM/YY`, the top bar is the tab band with a white bill tab (blue top border) and a sky Retail pill, uppercase black-weight CTA text.
- **Rules checked by the review:** every text/background pair >= 4.5:1, labels >= 12px, money in tabular numerals, placeholders and loading text end with the ellipsis character, icon-only buttons have an aria-label, `touch-manipulation` on the phone roots, targets >= 44px.
- **History / Back:** `hooks/useBackToClose` defers removing a sheet's history entry by a tick and removes all sheets that closed together with one `history.go(-n)`; it adopts its own entry when React re-runs the effect (dev StrictMode). `MobileBilling` is keyed on the draft's stable `localSessionId`, so a draft id replaced after the first autosave never resets the screen and closes open sheets.

### 8.1 Modifying a saved bill: the payment step
`Save changes` on a retail bill opens the same payment sheet as a new bill (a wholesale bill is always credit and a quotation takes no payment, so those save from the bar). Differences in edit mode (`draft.editingSaleId`):
- The sheet starts on the mode the bill was saved with, shows `Currently paid by <mode>` (captured on open, it does not follow the picks) and does **not** reset to Cash. A tap on Cash / UPI / Card / On credit only selects it (`aria-pressed`, white ring + check); `Save changes · <mode> · ₹total` saves, then the reason sheet appears.
- A split bill opens with its split showing; its button reads `Save changes ₹total`.
- Credit still needs a customer (the button is disabled without one).
Never hide the payment step for an edit and never reset the method when the sheet opens: the desktop rail shows the payment mode while editing, and the server re-processes payments on a full edit.
- **Testing an edit with Playwright:** the save is `POST /sales/<id>/revise/` (not `PUT /sales/<id>/`); stand in for that URL too, or the test really modifies the bill.
- **Modify goes straight to the editor.** `app/billing/page.tsx` skips the "Bill saved" screen (phone `SuccessView` and desktop `BillSuccessScreen`) when the URL has `?edit=`. Before this, a previous bill's success screen was still in memory, the page returned it early, and the editor and `EditSaleHydrator` (which loads the bill) were not on the page, so Modify showed the old success screen until New Bill was pressed. Covered by `__tests__/billingEditLink.test.tsx`.
- **Playwright harness rule:** register a catch-all that answers every non-GET to `/api/v1/` with a stand-in (let only login / token calls through), THEN the specific stand-ins. Match `POST /sales/<id>/revise/` too.

### 8.2 There is always one bill on screen (the "white screen after New bill" bug)

Saving a bill closes the draft it was made from (`useSaveBill` -> `closeDraft`). When that was the only draft, the store is left with none: `activeDraftId = null`. The desktop recreated one (an effect in `ActiveBillsTabs`), but `MobileBilling` returns `null` without an active draft and nothing recreated it, so **Save, then New bill, showed a completely blank page** (no error in the console, nothing is drawn).

The rule now lives once, in `app/billing/page.tsx`: when the store is loaded and there is no active bill, switch to an existing one or create an empty one. It covers every route into the state (New bill, closing the last bill, a bill saved from another tab) for both layouts, and the Modify loader (`EditSaleHydrator`) reuses that empty bill. Do not add a per-layout copy, and do not make a phone screen depend on a draft that something else may not have created. Test: `__tests__/billingNewBillAfterSave.test.tsx` (fails without the effect). When testing a save flow in a browser, always click **New bill** afterwards and save a second bill.

