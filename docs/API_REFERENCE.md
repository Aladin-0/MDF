# MediFlow — API Reference

All API functions are in `lib/mockApi.ts`, exported via `lib/apiClient.ts`.

Mock mode is active when `NEXT_PUBLIC_USE_MOCK=true`.

---

## authApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `login(phone, password)` | `phone: string, password: string` | `AuthResponse` | Matches against `mockStaff`; returns JWT-like tokens |
| `verifyPin(pin)` | `pin: string` | `StaffPinVerifyResponse` | Checks 4-digit PIN against staff list |
| `refreshToken(refresh)` | `refresh: string` | `{ access: string }` | Returns new mock access token |

---

## dashboardApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `getKPIs(outletId, date)` | `outletId: string, date: string` | `DashboardKPI` | Returns `mockDashboardKPI` with delay(400) |
| `getAlerts(outletId)` | `outletId: string` | `DashboardAlerts` | Returns `mockAlertSummary` with delay(300) |

---

## productsApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `search(query, outletId)` | `query: string, outletId: string` | `ProductSearchResult[]` | Filters `mockProducts` by name/composition/manufacturer |
| `getById(id)` | `id: string` | `ProductSearchResult \| null` | Finds product in `mockProducts` |

---

## salesApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `create(payload)` | `SaleInvoicePayload` | `SaleInvoice` | Builds invoice object, delays 600ms |
| `list(outletId, filters?)` | `outletId: string` | `PaginatedResponse<SaleInvoice>` | Returns `mockSalesInvoices` sorted by date |
| `getById(id)` | `id: string` | `SaleInvoice \| null` | Finds by ID in mock list |

Bill discount fields (create, update, revise; returned by create and `getById`): `extraDiscountPct` (percent, always sent) and `extraDiscountRupees` (the rupees as typed, or `null` for a percent discount). The rupees are only remembered, so that modifying the bill keeps them; the bill is priced from its lines and the percent.

---

## inventoryApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `getStock(outletId, filters?)` | `outletId: string, filters?: StockFilters` | `PaginatedResponse<ProductSearchResult>` | Filters + sorts `mockProducts` |
| `getProductBatches(productId)` | `productId: string` | `Batch[]` | Filters `mockBatches` by product ID |
| `getExpiryReport(outletId, days?)` | `outletId: string, days?: number` | `ExpiryReportItem[]` | Returns batches expiring within N days (default 90) |
| `getLowStockReport(outletId)` | `outletId: string` | `ProductSearchResult[]` | Products with totalStock < 10 |
| `adjustStock(payload)` | `StockAdjustmentPayload` | `{ success: boolean, message: string }` | Logs adjustment, delays 400ms |

---

## purchasesApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `list(outletId, filters?)` | `outletId: string, filters?: { distributorId?, outstanding?, from? }` | `PaginatedResponse<PurchaseInvoiceFull>` | Filters + sorts `mockPurchaseInvoices` |
| `getById(id)` | `id: string` | `PurchaseInvoiceFull \| null` | Finds invoice by ID |
| `create(payload)` | `CreatePurchasePayload` | `PurchaseInvoiceFull` | Creates new invoice, prepends to mock array |
| `recordPayment(purchaseId, amount)` | `purchaseId: string, amount: number` | `{ success, message }` | Updates amountPaid/outstanding on mock object |

---

## distributorsApi

| Function | Parameters | Returns | Mock Behavior |
|---|---|---|---|
| `list(outletId)` | `outletId: string` | `Distributor[]` | Returns all `mockDistributors` |
| `getById(id)` | `id: string` | `Distributor \| null` | Finds by ID |
| `getLedger(distributorId)` | `distributorId: string` | `DistributorLedgerEntry[]` | Returns 4 hardcoded ledger entries |
| `create(payload)` | `any` | `Distributor` | Creates with generated ID, delays 400ms |
| `update(id, payload)` | `id: string, payload: any` | `Distributor` | Returns merged object, delays 400ms |

---

## Mock Data IDs Reference

### Staff (for PIN verification)
- `staff-001` — Rajesh Patil (super_admin) — PIN: 0000
- `staff-002` — Priya Sharma (admin) — PIN: 1234
- `staff-003` — Rahul Kumar (manager) — PIN: 2345
- `staff-004` — Sunita Devi (billing_staff) — PIN: 4821
- `staff-005` — Amit Singh (billing_staff) — PIN: 3567

### Products
- `prod-001` — Metformin 500mg (Schedule H, GST 12%)
- `prod-002` — Paracetamol 500mg (OTC, GST 12%)
- `prod-003` — Alprazolam 0.25mg (Schedule H1, GST 12%)
- `prod-009` — Atorvastatin 10mg (Schedule H, GST 12%)
- `prod-010` — Becosules Capsule (OTC, GST 0%)

### Distributors
- `dist-001` — Ajanta Pharma Distributors (GSTIN: 27AAJCA1234B1Z3, Credit: 30 days)
- `dist-002` — Sun Pharma Wholesale (GSTIN: 27AABCS1234C1Z7, Credit: 45 days)
- `dist-003` — Cipla Direct (GSTIN: 27AAACC1234D1Z1, Credit: 21 days)

### Purchase Invoices
- `purchase-1` — AJD-2026-0089 — Fully Paid ✅
- `purchase-2` — AJD-2026-0102 — Unpaid ₹8,900
- `purchase-3` — SPW-2026-0234 — Partial ₹10,600 outstanding
- `purchase-4` — CIPLA-2026-1123 — Fully Paid ✅
- `purchase-5` — AJD-2026-0071 — OVERDUE ₹22,000
