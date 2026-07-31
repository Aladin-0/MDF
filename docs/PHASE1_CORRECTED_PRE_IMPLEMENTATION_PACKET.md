# Phase 1 Corrected Pre-Implementation Packet

## 1. Executive Decision
**Is Phase 1 ready to implement after this correction?**
Yes, this corrected plan resolves the risks identified in the initial draft and provides a safe, production-grade strategy. Implementation can proceed once this packet is approved.

**What was unsafe in the old plan?**
1. It assumed that all historical `SalesReturnItem.total_amount` values were natively GST-inclusive and could be reverse-calculated purely via math. This ignored the fact that legacy or modified data might have edge cases (e.g., custom return rates, manual adjustments) where math alone would hallucinate incorrect tax values.
2. It assumed `apps/billing/views.py` was the single authoritative write path without inspecting the codebase for other paths like modification services or separate return endpoints.

**What changed in the corrected plan?**
1. Established a strict, multi-tier backfill priority focusing on proportional derivation from the original `SaleItem` to guarantee rounding and amount parity.
2. Verified all authoritative write paths across views and services for both sales and returns.
3. Explicitly deferred split-tax fields at the item level to maintain architectural symmetry.
4. Defined a strict API exposure policy so we don't leak unverified fields to the frontend.

## 2. Verified Write Path Map
Based on code inspection, the authoritative write paths for creating and updating these records are spread across specific views and services. Immutable field assignment MUST occur in all of them.

### `SaleItem` Write Paths
- **Initial Creation:** `apps/billing/views.py` (inside `BillingViewSet` around line 507 where `SaleItem.objects.create` is called).
- **Modification Updates:** `apps/billing/sale_update_service.py` (inside `atomic_sale_update` around line 423 where new `SaleItem`s can be created during a bill modification).

### `SalesReturnItem` Write Paths
- **Initial Return Creation:** `apps/billing/payment_services.py` (inside `create_sales_return` around line 383).
- **Modification Updates:** `apps/billing/sale_return_update_service.py` (inside `update_sales_return` around line 130 where new `SalesReturnItem`s can be added).

**Authoritative Layer:** The Services layer (and the view's transaction block) is authoritative. Snapshot assignment will happen exactly at the ORM `.create()` boundaries in these 4 locations to ensure consistent hydration before saving to the database.

## 3. Corrected Schema Proposal
We will add the following explicit tax fields.

**For `SaleItem`:**
- `hsn_code = models.CharField(max_length=20, null=True, blank=True, help_text='Snapshot of HSN code at time of sale')`

**For `SalesReturnItem`:**
- `hsn_code = models.CharField(max_length=20, null=True, blank=True)`
- `gst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)`
- `taxable_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)`
- `gst_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)`

**Design Decision regarding split taxes (`cgst`, `sgst`, `igst`):**
Split tax fields are **DEFERRED** from the item level. 
*Why?* The current architecture relies on `SaleInvoice` to store the split amounts. The original `SaleItem` model only tracks aggregate `taxable_amount` and `gst_amount`. Adding split amounts to `SalesReturnItem` would break symmetry with `SaleItem` and introduce ambiguity, as item-level splits cannot be natively validated against the original sale item. The split logic will continue to be safely derived at the invoice/return level (via `journal_service.py` and `_is_interstate`).

## 4. Corrected Backfill Strategy
A new management command (`backfill_phase1_gst.py`) will be created to populate these fields for historical records.

### Source-of-Truth Priority Order
For `SalesReturnItem`, the backfill will evaluate each row using the following strict priority:

**Priority 1: Exact Proportional Match (Safest)**
- Condition: If the `original_sale_item` quantity/unit basis is verified and reliable (pack_size > 0 and total_units > 0), AND `SalesReturnItem.total_amount` exactly matches the proportional `total_amount` of the `original_sale_item` based on `qty_returned`.
  *(Formula: `expected_total = (sale_item.total_amount / sale_item.total_units) * returned_units`)*
- Action: Copy `hsn_code` and `gst_rate` from `original_sale_item`. Mathematically scale `taxable_amount` and `gst_amount` by the exact same unit ratio. This preserves original rounding logic perfectly. If the condition fails, fall back to Priority 2 or mark ambiguous.

**Priority 2: Safe Reverse-Calculation**
- Condition: If `total_amount` does not match the strict proportion (e.g., custom `return_rate` was used), but the `gst_rate` on the `original_sale_item` is > 0 and the `total_amount` > 0.
- Action: Copy `hsn_code` and `gst_rate` from `original_sale_item`. Compute `taxable_amount = total_amount / (1 + gst_rate/100)` and `gst_amount = total_amount - taxable_amount`.

**Priority 3: Ambiguous Exception Reporting**
- Condition: If the `original_sale_item` is missing (legacy orphan rows), or `total_amount` is 0 but `qty_returned` > 0, or math fails validation constraints.
- Action: Do NOT backfill. Mark the row as `AMBIGUOUS`.

### Dry-Run & Exception Reporting Plan
The management command will run in `--dry-run` mode first. It will output a summary payload:
- Total rows processed.
- Count of rows resolved via Priority 1.
- Count of rows resolved via Priority 2.
- Count of `AMBIGUOUS` rows (Priority 3).
- Detailed CSV/JSON exception report of all ambiguous rows with their IDs, allowing for manual review.

## 5. API / Serializer Exposure Policy
- **Backend Persistence:** Mandatory. Models will require these fields.
- **Serializer / Admin / Debug:** We will add these fields to the Django Admin panels and `SaleItemSerializer` / `SalesReturnItemSerializer` as `read_only` fields. This is strictly for auditing, testing, and debugging.
- **Frontend / UI:** Deferred. We will not modify the frontend React/Next.js code to consume or display these fields yet. This phase is purely to secure backend persistence for Phase 2.

## 6. Migration & Rollout Plan
1. **Database Migration:** Apply the schema migration to add the fields to production first (additive only, no data changes).
2. **Deploy Code:** Deploy the updated write paths (views and services) to production. From this moment, all new records will securely store snapshots.
3. **Dry-Run Mode:** Run the backfill script in `--dry-run` mode against a staging/production-like database.
4. **Review Exception Report:** Investigate any Priority 3 ambiguous rows and review dry-run test results. Ensure the exception threshold is acceptable.
5. **Execute Backfill:** Run the backfill script without `--dry-run` on production to hydrate historical records.
6. **Rollback Considerations:** If the backfill fails midway, the script will be built to be idempotent. If the code deployment introduces bugs in bill creation, we will roll back the deployment and handle the `null` fields temporarily.

## 7. Verification Gate
Before actual implementation begins, the following must be confirmed:
1. **Staging Verification:** The backfill script must run on a staging snapshot without throwing unhandled exceptions.
2. **Safety Threshold:** Less than 1% of total `SalesReturnItem` records should fall into the Priority 3 `AMBIGUOUS` bucket. If more than 1% are ambiguous, we must pause and re-analyze the historical data shape.
3. **Write-Path Tests:** New automated tests must pass proving that `atomic_sale_update` and `update_sales_return` correctly persist the snapshot data alongside the standard creation paths.

## 8. Open Questions Resolved
- **Reverse-Calculation Safety:** Resolved by introducing Priority 1 (Proportional Scaling) and constraining reverse-calculation to Priority 2 with strict validation guards.
- **Authoritative Write Paths:** Resolved by statically analyzing the codebase to find the two creation paths for sales and two creation paths for returns.
- **Split Tax Fields:** Explicitly excluded to match existing `SaleItem` architecture and rely on `SaleInvoice` ledgers.
- **API Exposure:** Explicitly restricted to backend, serializers, and admin only.
