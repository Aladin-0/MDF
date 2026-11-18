# Batch-wise tracking: how other software does it, where MediFlow stands, and how to get the best of both

Prepared 17 Nov 2026. Research: vendor help pages and docs (links at the end), plus a read-only audit of our own code and of the dev database (`mediflow` on `mediflow_postgres`). Nothing was changed.

---

## 1. The short version

1. **The Stock Ledger page looks confusing for two different reasons.** Part of it is layout (a flat list of 7,405 batches, nine columns, money and quantities mixed). The bigger part is **data**: the ledger was never properly opened. **69% of stocked batches (5,628 of 8,167) have no ledger rows at all**, so the page shows negative balances and mismatches. A prettier page on top of that data would still look wrong.
2. **Every mature product follows the same shape:** *item first, then its batches, then one batch's history.* Nobody shows a flat list of every batch in the shop.
3. **We are ahead on:** per-batch pack/price/rack data, an append-only ledger with running balance, GST write-off allocation (ITC reversal), audit trail, permissions, mobile layouts, and (since this week) an Expiry Manager that already covers what GoFrugal's "expiry return screen" does, plus month and date-range search and Excel.
4. **We are behind on:** a trustworthy ledger, an item-first batch view, **batch to customers/invoices tracing (recall)**, supplier on every batch, expiry rules that use the outlet's own alert days, and "quarantine" for expired stock.
5. **Recommended order:** fix the ledger data first (small, safe), then redesign the page on top of it, then add supplier assignment and recall tracing.

---

## 2. What is wrong with the page in your screenshot

### 2a. What you see (layout)

| Problem | Why it confuses |
|---|---|
| Left list of **7,405 batches**, each shown as *product name + batch number* | You must pick a batch out of thousands before anything makes sense; the same product name repeats ("ICERELAC-WHEAT 300GM" twice) |
| Status chips "Low / In stock" on every row | Visual noise, same chip on thousands of rows |
| "1 tablet left" for a **300 GM** product | The batch's unit label defaulted to *tablet* (24 such cases found by name; more by type) |
| Four cards: **₹ stock in, ₹ stock out, ₹ net change, transactions** | A ledger answers "what moved"; the cards answer "how much money", and mix it with fractional packs ("-460.43 packs") |
| Table has **Type + Voucher + Party** that all say the same thing | A write-off shows as *Adjustment Out* + *ADJ / Stock Adjustment* + *Expired - Expiry w...* (the reason squeezed into the Party column and cut off) |
| **In / Out / Rate / Balance** each stack a quantity and a rupee value | Eight numbers per row; units flip inside one row ("Out -2 strips", "Balance 0 tablets") |
| **Negative balances** ("-1 tablets, -₹317.97") look like a bug | They are, see 2b |

### 2b. What the data says (read-only queries on the dev database)

| Fact | Number |
|---|---|
| Batches that still hold stock | 8,167 |
| ...of which have **no ledger row at all** | **5,628 (69%)** |
| ...of which came in as imported opening stock | 8,047 (98%) |
| Ledger rows whose running balance is **negative** | **552** (518 from sales, 34 from write-offs) |
| Batches whose last ledger balance is **different from the batch's real stock** | 465 |
| Stocked batches that have **any purchase record** (so a known supplier) | **98 (1.2%)** |
| Stocked batches already past expiry | 445 |
| Write-offs recorded so far (all "Needs review" for GST: nothing to match them to) | 122 |

Plain reading: the ledger can only explain what happened *after* the stock was imported, and the import never wrote the opening balance. The first sale or write-off of such a batch drives its balance below zero. **This includes the write-offs made from the new Expiry Manager** (34 of 122 went negative for this reason): the removal is correct (the batch's stock is right), but the ledger line under it has no starting point. That is a flaw in how I built the removal, and it is the first thing to fix (section 6, step 0).

It also explains why the distributor filter in the Expiry Manager showed "Distributors 0": supplier is only known for stock that came in through a purchase invoice.

---

## 3. How other software handles batch tracking

*All claims below come from the vendors' own pages, which are marketing or help text; they were not tested in the products. Where a source did not say, it is marked "not stated".*

### Marg ERP (the Indian pharmacy standard)
- Batch-wise stock with expiry per batch; batch-wise stock reports showing where each batch sits and its quantity.
- Expiry module: expired and near-expiry lists, with planning of supplier returns before expiry. Automatic FIFO/FEFO picking is described on a third-party listing. Batch-wise stock across locations with transfers. Expiry data feeds reordering.
- Not stated: how the screens look, filters, or how returns are valued.

### GoFrugal (closest to our market)
- Frames expiry as **prevention, identification, return** (a useful model, see section 5).
- **Expiry return screen:** items listed **by distributor**, return valued at **MRP, purchase rate or landing cost** (user's choice), to get a credit note.
- **At purchase entry:** warns when an incoming item expires within N days, so the clerk can accept or reject it. **At billing:** a short-expiry flag so the owner can push fast movers or send slow ones back.
- **Reorder** items expiring within 60 days, return the old stock when new stock arrives.
- Claims recovery is better the earlier stock is identified (a vendor figure of 60-70% when found ~3 months ahead, unverified).
- Not stated: date-range or month filters, or reports.

### TallyPrime (accounting-first, used by many shops)
- **Batch Summary:** pick an item, then a batch, see its inward and outward quantities, rate and value.
- Toggles (F12) add manufacturing date, expiry date and **days to expiry** columns; Ctrl+B filters by **expiry date range**.
- **Stock Ageing Analysis:** lists expired and soon-to-expire items **batch-wise**.
- Stock Query shows godown/batch quantities but not expiry by default.

### Odoo (general ERP)
- Lots/serials with several dates: expiration, best before, **removal**, alert. **FEFO** picks by the *removal date*; the docs note lots past some dates may still be picked, and lots without a removal date are picked last.
- A red **expiration alert** on the lot, and an alert view in the lot list.
- Third-party claim (not Odoo's own): core Odoo does not strictly block shipping near-expiry stock.

### Zoho Inventory
- **Batch Details report:** per batch, reference, manufactured date, expiry date, quantity in, quantity available; zero-stock batches can be hidden.
- **Batch Transaction Summary:** click a batch to see **every inward and outward transaction**, so you can see which invoices or customers received units from it.
- Known gap (community thread): shows only *available* quantity, not units packed but still at a warehouse.

### SAP Business One (+ add-ons)
- A batch report per batch number, and a list of **every document in which a batch was used**.
- Third-party **Batch Traceability 360** (for recalls and complaints) follows a batch from purchase through to final delivery. SAP's larger "where-used" list is an ECC/S4 feature, not Business One.

### General pharmacy guidance (vendor guides, not regulation)
- FEFO is non-negotiable; alerts at **60-90 days**, adjustable by item class; quantities by lot and location; recalls limited to the affected batches; regular cycle counts instead of month-end only.

---

## 4. What they all share

1. **Item first, batch second.** Select a product, see its batches, open one. (Tally, Zoho, SAP, Odoo.)
2. **One batch has one identity:** number, mfg date, expiry date, days left, quantity in, quantity available.
3. **One batch has one history,** reachable by clicking it: every purchase, sale, return, adjustment. (Zoho's Batch Transaction Summary, Tally's Batch Summary, SAP's documents-per-batch.)
4. **Expiry is a report with date filters,** not a fixed set of buttons. (Tally.)
5. **Expiry leads to action:** a return list by distributor with a chosen valuation, then a credit note. (GoFrugal.)
6. **Warnings at the moments that matter:** when stock comes in (accept/reject) and when it is sold. (GoFrugal.)
7. **Tracing both ways:** batch to customers, batch to supplier, for recalls and inspectors. (Zoho, SAP.)
8. **One unit per number.** Quantities are shown in one consistent unit.

---

## 5. Scorecard

| Area | Others (best of) | MediFlow today | Verdict |
|---|---|---|---|
| Batch data per batch (pack, MRP, rates, landing, rack, mfg/expiry) | All have most of it | All of it, per outlet, with per-batch pack rules | **Better**: pack rules per batch are stronger than most |
| Editing many batches | Via vouchers or one at a time | "Edit all batches" grid with validation and undo | **Better** |
| FEFO selling | Marg, Odoo | Sale order is FEFO; billing greys out expired batches | Same |
| Expiry search | Tally: date range; GoFrugal: fixed | Expiry Manager: presets, **picked months, custom dates, distributor, search**, Excel | **Better** (new) |
| Return expired stock to supplier | GoFrugal: by distributor, MRP/purchase/landing | Expiry Manager groups by invoice, opens the debit note | Same, **missing the valuation choice** |
| Write-off with accounting trail | Rarely described | Ledger + GST allocation (ITC reversal) + audit, all-or-nothing, own-password confirm | **Better** |
| Batch history view | Zoho/Tally/SAP: item to batch to history | Stock Ledger: flat list of all batches, 9 columns | **Worse** |
| Ledger trustworthy | Implied | 69% of stocked batches have no ledger; 552 negative rows; 465 mismatches | **Worse** (data) |
| Supplier on every batch | Purchase-linked; GoFrugal groups returns by distributor | Only if it came through a purchase (1.2% in dev data) | **Worse** |
| Recall / trace batch to customers | Zoho, SAP add-on | The data exists (sale rows carry the batch) but there is no screen or export | **Worse** |
| Warnings at purchase entry | GoFrugal accept/reject on short expiry | Near-expiry note under the expiry box, no block option | Slightly worse |
| Alert window set by the shop | Cleverence: 60-90 days, per class | `expiry_alert_days` exists in settings, no screen I found reads it | **Worse** |
| Quarantine of expired stock | Odoo-style removal/alert dates | Expired stock stays "in stock" until written off | **Worse** |
| Phone use | Mostly desktop | Mobile layouts for billing, purchase, inventory, expiry | **Better** |

---

## 6. Best of both: what to build, front to back

### Step 0: make the ledger trustworthy (backend, small, do first)

| Change | Detail |
|---|---|
| **Opening balance for every batch** | A one-time, dry-run-first command that writes an `OPENING` row for each stocked batch that has none, sized so the ledger ends at the batch's real stock (it must equal what the batch holds now, so it is computed backwards from the rows that exist). Same style as `repair_pack_definitions`. |
| **Never post an OUT on a batch with no history** | `post_stock_ledger_entry` (and so Adjust and the Expiry Manager) first writes the opening row if the batch has none. Fixes my removal's negative lines. |
| **Reconciliation endpoint + health card** | "465 batches: ledger differs from stock" with a list and a per-batch fix. Runs on the Stock Ledger page for managers. |
| **Guard against negative** | A sale or write-off that would go below zero is flagged `needs review` instead of silently producing a negative balance. |

Risk: low if it is dry-run first and only *adds* rows. It does not change batch quantities.

### Step 1: redesign the Stock Ledger page (frontend, on top of step 0)

Replace the flat batch list with **product, then batch, then history**:

```
Search a product  [ icerelac          ]          (or "All movements")
 ICERELAC-WHEAT 300GM      Maker · 3 batches · 5 packs in stock
   ┌ 2930   exp Mar 2027 · 120 days  · 2 packs   ┐   ← FEFO order, click one
   └ 2931   exp Jun 2027 · 210 days  · 3 packs   ┘
 Movements of 2930                     [ Received 10 | Sold 7 | Written off 1 ]  (packs, ₹ behind a toggle)
   17 Nov  Written off (Expired)   −1 pack    balance 2 packs     ▸ details
   12 Nov  Sold  INV-2231 · Ramesh −2 packs   balance 3 packs     ▸ details
```

- **One line per movement:** date, a plain-words event ("Sold", "Received", "Written off: Expired", "Returned to supplier"), product and batch (only when more than one batch is showing), one signed quantity, one balance.
- **Money behind "Show values"** (only for people with `view_purchase_rates`), not four columns of it.
- **One unit per number**, computed on the server so every screen agrees (packs + loose in the batch's own unit).
- **Batch drawer** (opens from any batch anywhere: Inventory, Expiry Manager, ledger): identity, expiry, supplier(s) and invoices, in/out totals, movements, and the actions Edit, Adjust, Write off, Return.
- **Honest empty states:** a batch without an opening balance says "History starts after import" with a fix button for managers, never a negative number.
- Summary cards become counts: Received / Sold / Written off (packs).
- Phone: cards (already the pattern), the batch list becomes a search-then-pick step.

### Step 2: supplier and recall (backend + frontend)

- **Supplier on every batch.** Today supplier = first posted purchase (works for 1.2% of stock in dev data). Add a bulk **"Assign distributor"** tool for opening-stock batches, stored on the batch (or a small `BatchSupplier` link), so the Expiry Manager's distributor filter and the return flow work for old stock.
- **`GET /batches/<id>/trace/`:** suppliers and invoices that brought it in, every sale (invoice, customer, quantity) and return. Plus **search by product + batch number** and an **Excel export** for a drug inspector or a supplier recall. All the data already exists in ledger and sale rows.
- Needs care: outlet isolation and the `view_purchase_rates` rule on cost columns; customer data only for people who may see customers.

### Step 3: expiry policy (backend + frontend)

- Use the outlet's own `expiry_alert_days` (exists, unused) and an optional per-product override; the Expiry Manager's default window, the dashboard alert and the purchase-entry warning all read it.
- **At purchase entry:** short-expiry **accept / reject** (GoFrugal's model), configurable threshold.
- **Quarantine / "Expired - awaiting return"** state: expired stock stays visible and countable but cannot be sold or picked; it leaves the shelf total.
- **Return valuation choice** (MRP / purchase / landing) on the debit-note step.
- Optional: cycle count per batch (guides recommend it over month-end counts).

### Rough sizing and order

| Step | What | Size | Risk |
|---|---|---|---|
| 0 | Ledger openings, guard, reconciliation | 2-3 days | Low (adds rows, dry-run first) |
| 1 | Product-first ledger page, batch drawer, one-unit server fields | ~1 week | Medium (UI, shared across screens) |
| 2 | Assign distributor, trace API and export | 3-4 days | Low-medium |
| 3 | Expiry policy, accept/reject, quarantine, valuation | ~1 week | Medium (touches billing and purchase) |

I would do **0 then 1** together, then 2, then 3.

---

## 7. Caveats

- Competitor information is from vendor pages and help text; I could not test the products. Anything marked "not stated" was simply absent from the page I read.
- The database numbers are from this **dev** database (a Marg import). Production may differ; run the same queries there (they are read-only) before deciding step 0's scope.
- Odoo's traceability report and similar features were not covered by my sources, so I did not include them.

## Sources

- Marg: [Drug inventory management features](https://margcompusoft.com/m/?p=48535), [pharmaceutical ERP listing](https://saasrat.com/products/marg-pharmaceutical-erp)
- GoFrugal: [Pharma expiry management](https://www.gofrugal.com/blog/pharmacy-expiry-management/), [Pharmacy solution highlights](https://www.gofrugal.com/blog/pharmacy-solution-highlights)
- TallyPrime: [Batch Summary](https://help.tallysolutions.com/batch-summary/), [Batches in TallyPrime](https://help.tallysolutions.com/tally-prime/inventory/batches-in-tallyprime/), [Stock Ageing Analysis](https://help.tallysolutions.com/knowledgebase/stock-ageing-analysis-report-tally/), [Stock Query](https://help.tallysolutions.com/tally-prime/inventory-reports/stock-query-tally/)
- Odoo: [Expiration dates](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/product_management/product_tracking/expiration_dates.html), [FEFO removal](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/removal_strategies/fefo.html)
- Zoho Inventory: [Advanced inventory reports](https://www.zoho.com/inventory/help/reports/advanced-inventory-reports.html), [Batch tracking](https://www.zoho.com/inventory/help/advanced-inventory-tracking/batch-tracking.html)
- SAP Business One: [Batch report](https://sap-b1-blog.com/en/lexicon/batch-report-sap-b1/), [CompuTec Batch Traceability](https://learn.computec.one/docs/appengine/plugins-user-guide/batch-traceability/overview)
- Pharmacy practice: [Cleverence pharmacy inventory guide](https://www.cleverence.com/articles/for-business/pharmacy-inventory-4957/)
