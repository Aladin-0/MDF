# Inventory page, stock list and stock adjustment

Read this before changing `/dashboard/inventory`, the inventory list endpoint (`GET /inventory/`) or stock
adjustment (`POST /inventory/adjust/`). Pack definitions and loose selling are in `docs/PACK_DEFINITIONS.md`.

## One rule for each question (server decides, the page shows)

| Question | Rule | Where |
|---|---|---|
| Is a product **low stock**? | total packs (strips + loose/pack size) is **below the outlet's own minimum if it set one (> 0), else 10** (`DEFAULT_MIN_QTY`). The list filter, the row flag `isLowStock` and the dashboard alerts all use it. | `inventory/views.py`; `reorderLevel()` in `lib/inventory.ts` |
| Is a product **expiring soon**? | any batch that **still has stock** and expires within **90 days, including batches already expired**. | `inventory/views.py` (`stocked_sq`, `EXPIRING_SOON_DAYS`) |
| What is the **nearest expiry**? | the earliest expiry among batches **with stock**, expired or not (so expired stock shows a red date, not "none"). The API sends `2099-12-31` for "no stock"; the UI shows "—" (`hasExpiry()`). | same |
| What is a batch **worth**? | packs = strips + loose / **the batch's** pack size, times the rate for the chosen valuation (Purchase / Landing / MRP). Never the product's pack size. | `batchValue()` in `lib/inventory.ts` |
| What can the list be **sorted** by? | `name`, `stock`, `expiry` only, with `sortOrder=asc\|desc`, **done by the server**. The client never re-sorts a page. | `sort_map` in `inventory/views.py`; `SORT_KEYS` in `lib/inventoryParams.ts` |
| How many rows per request? | **at most 100** (the server clamps). Use `fetchAllStock()` (walks every page) when you need the whole list. Never ask for `pageSize: 500`. | `lib/inventoryApi.ts` |

## Adjusting stock

* The request must have `type`, a **signed** `qty`, a staff `pin`, and `adjustUnit` (`strips` or `loose`), with
  `?outletId=` **in the query string**. Build it with `buildAdjustPayload()` and send it with `inventoryApi.adjustStock`.
  (The modal used to send other field names and no PIN, so every adjustment failed with a 400.)
* Whole packs change only the pack count and cannot go below 0; loose units may break a pack open
  (`previewAdjustment()` mirrors this so the form can show the result before you confirm).
* Permission name: `adjust_stock` (manager and above, `IsManagerOrAbove`). Gate buttons with it, not with `manage_staff`.
* A product has several batches: let the user choose (the modal takes `batches`), never silently pick `batches[0]`.

## Caching

The list is cached for 2 minutes. Cached pages carry a **version** (`inventory/cache_utils.py`):
call `bump_inventory_cache(outlet_id)` after anything that changes stock you want to show at once. Do **not** use
`cache.delete_pattern`: it exists only in django-redis, this project uses Django's own Redis cache, and the
failure used to be swallowed, so the list stayed stale for 2 minutes after every adjustment.

## The page

* The tab, search, schedule, sort, page and page size live in the URL (`lib/inventoryParams.ts`, `hooks/useInventoryFilters.ts`).
* Counts on the cards and the tab badges come from **one** hook, `useInventorySummary`. They are all **product**
  counts. A failed figure shows "Couldn't load", never a made-up zero.
* Exports use `downloadProductSummary` / `downloadBatchDetail` (shared headers, `assertOk`); the tab lists export their
  own rows as CSV.

## The product detail page (`/dashboard/inventory/<id>`)

Built to show a lot in little room: a two-line header, **one** summary strip (not a grid of big cards), and a dense
batch table (about 40px rows, no Mfg Date or Status column: the mfg month sits under the batch number and the status is
the coloured text in the Expiry cell). Do not turn the strip back into tiles.

* Numbers come from `lib/productDetail.ts` (`computeMetrics`, `batchState`, `describePack`), built on the same helpers as the
  list, so a product shows the same stock, value and expiry on both pages. Loose units count in every value; cost value is at
  **landing** rate and says so; a product is low below its reorder level (default 10); a batch expiring **today** is still sellable.
* "Receive Stock" goes to `/dashboard/purchases` (there is no `/purchases/new`: it was a 404).
* Refresh and every save refresh `['inventory']` (this page's key is `['inventory','product',...]`; refreshing
  `['inventory','stock']` did nothing).
* A failed load shows an error with a retry. "Product Not Found" is only for a product the server does not have.
* Quick edit: batch fields change that batch, product fields change the product (and so every batch). A rejected save
  tells the user and puts the stored value back.

## Editing batches and products (the old "Quick edit")

Editing live inventory is risky, so it works like this. The old column-picker (choose a column, then edit that cell in
every row, selects saving the moment you picked) is gone.

* **Who:** `edit_inventory` (manager and above), the permission the API enforces on `PUT /batches/<id>/` and
  `PUT /products/<id>/`. The UI used to check `manage_products`, which also covers purchase-flag staff the API refuses.
* **Batch edit** (`EditBatchModal`): one form per batch with live validation, a "What will change" list, only the changed
  fields sent, an **Undo** on the saved message, and a tick-box before the pack can be changed. Quantities are NOT edited
  here: use Adjust (PIN, audited).
* **Product edit** changes the product for **every outlet** (the catalogue is shared). The list's "Quick edit (all
  outlets)" column says so and every save has an Undo. Product fields are never edited from a batch row.
* **Server rules** (`BatchDetailUpdateView`): the row is locked and only changed fields are written (the old code
  saved the whole row, so a sale committing during an edit was overwritten and its stock came back); expiry required;
  MRP > 0; mfg <= expiry; no duplicate batch number for the product at the outlet; prices to 2 dp; selling below cost
  is allowed but returns a `warnings` entry. Pack edits go through `pack_rules`.
* **Audit:** every real change writes `ActivityLog` (`UPDATE`, `Batch` or `Product`, with old/new). A save that changes
  nothing writes nothing.
* **Freshness:** a batch edit calls `bump_inventory_cache(outlet)`. The list AND the billing screen's product search
  key include that version, so a new price/date/rack shows at once (the billing search cache is 60 s and was never
  refreshed, so billing kept selling at the old MRP for up to a minute).

## Keeping the screens calm (no flashing)

* **Dim a table only while the previous rows stand in for a change the user just made** (`isPlaceholderData`: new sort,
  page, search), never on `isFetching`: a quiet background refresh (after a save) must not make everything blink.
* **Cards show only what they need.** The Stock Value card reads `GET /reports/inventory/valuation/?summary=true`
  (hundreds of bytes). The full answer is ~580 KB and made that card arrive long after the other three.
* **Mount editors only when opened** (`{editing && <EditProductModal ... />}`): a closed-but-mounted editor still runs its
  hooks and requests (it loaded the distributor list on every visit).
* A dev-server note: `docker-compose` runs `next dev` with `apps/frontend` mounted, so every file save recompiles and
  reloads an open tab. A tab left open on the page flickers while files are being edited; that is the dev server, not the page.

## The home dashboard's stock alerts

`GET /dashboard/daily/` -> `alerts` uses the rules in the table at the top of this file (it used to count per batch, ignore
loose units, list empty batches, skip expired ones and send every row). Low stock is per **product**; expiring is any
batch that **still has stock** due within 90 days **or already expired** (`daysUntilExpiry` is negative). Each list is the
worst 8 and `alerts.counts` is the true total: show the count, never `list.length`. The rules live in
`apps/billing/dashboard_services.py::stock_alerts`; change them there and here together.

## Medicine search (billing, purchase, returns, PO)

One endpoint, `GET /products/search/`, serves every medicine search box; `apps/inventory/search_query.py` decides what the text means (the PO catalogue search, `/products/catalog/search/`, shares the same parser).

| Type | Means |
|---|---|
| `dolo 650` | every word must be in the name, salt or maker, any order; typos tolerated only when nothing matches |
| `L+175` | names starting with `L` priced **about** 175 (+/-10%, at least +/-1 rupee), **closest price first**; nobody remembers 178.31. Only the batches in that window are returned, the closest first, and each result carries `matchedMrp` (the batch price it matched) |
| `L+20-30` / `L+<50` / `L+>100` | a price range / up to 50 / from 100 |
| `L+=23.50` | exactly that MRP |
| `C,losartan` | every brand whose composition contains the salt (several: `C,losartan,amlodipine`) |
| `8901234567890` | a scanned barcode: exactly that product. Only works for products whose `barcode` is filled in (Inventory > Edit product) |
| `A` / `Alt+A` in billing | substitutes of the highlighted medicine: `GET /products/{id}/substitutes/`. Plain `A` only after the arrow keys moved the highlight (otherwise it is a letter you type) |

Rules to keep: a price search ranks by the price of the product's closest in-stock batch in the window (what billing sells and what the row shows), falling back to the catalogue MRP only when no batch is in the window; in-stock products are listed **before** out-of-stock ones and the candidate cut happens after that ordering (a broad query used to hide in-stock items behind zero-stock ones); results are 30 in stock + 10 out of stock; the cache key hashes the query. Substitutes = the *identical set of salts* (`salt_set`: order and punctuation ignored, empty / `-BLANK-` never matches); the catalogue keeps strengths in the product **name**, so `strengths(name)` / `dosage_form(name)` rank same-strength, same-form brands first and the UI labels the rest. A bottle size (`60ML`) is not a strength. Do not add another place that parses `L+..` / `C,..`: use `parse_query`.

## Product field suggestions (Manufacturer and Composition)
The Manufacturer and Composition boxes of the product forms (`AddNewProductDrawer`, `EditProductModal`) offer the catalogue's own values while you type, from `GET /products/suggestions/?field=manufacturer|composition&q=&limit=` (`ProductSuggestionsView`, logic in `apps/inventory/suggestions.py`). The frontend piece is one component, `components/shared/SuggestInput.tsx` (an ARIA combobox on a Radix popover; hook `hooks/useCatalogSuggestions.ts`), used by both forms so desktop and phone behave the same.

- **The catalogue data is dirty, so the server cleans it** (do not "simplify" this to a plain `icontains` list): old imports left filler in both fields (`SURGICAL` in ~1,600 compositions, `-BLANK-`, `.`, `GENERAL ITEMS`), the same company spelt several ways (`CIPLA` / `cipla`) and typos. `PLACEHOLDERS` in `suggestions.py` is the filler list; values are merged on `norm_key` (case and spacing ignored) and shown with their commonest spelling.
- **Ranking:** the whole value, then a word of it starts with what was typed, then it is inside; within a tier the more products use it the higher. An empty text gives the most used values.
- **A composition option carries what its products usually have** (`hsnCode`, `gstRate`, `scheduleType`). `AddNewProductDrawer` uses it to fill the boxes the clerk left EMPTY (never overwriting), only with values the form can hold, and shows "Filled HSN 3004, GST 5% from the 63 products with this composition. Check them before saving." **`scheduleType` is only ever a real schedule (H, H1, X ...), never `OTC`**: OTC is the default a product gets when nobody chose, so it proves nothing, and the clerk must choose it. The Edit modal offers the list only and never auto-fills (it would silently change an existing product's tax or schedule).
- The box stays an ordinary text box: anything can be typed, nothing is asked of the server until the box is used, and if the server cannot be reached there is simply no list. Escape closes only the list (not the dialog), Enter takes the highlighted option only, options are 44px on touch and picking one does not close the phone keyboard.
- Tests: `apps/inventory/tests/test_product_suggestions.py` (45), `components/shared/SuggestInput.test.tsx`, `components/purchases/__tests__/AddNewProductDrawer.test.tsx`.

