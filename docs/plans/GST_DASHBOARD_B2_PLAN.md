# Phase B2: GST Dashboard UI MVP Design

## 1. User Stories and Use Cases
1. **Compliance Overview**: "As a CA, I want to select a tax period and immediately see GSTR-1 and GSTR-3B summaries along with their validation statuses, so I can quickly assess compliance before advising my client."
2. **ITC Tracking**: "As a pharmacy owner, I want to see how much ITC is matched, missing in 2B, or mismatched, so I can follow up with non-compliant vendors and maximize my working capital."
3. **Data Export**: "As a user, I want to download GSTR-1 and GSTR-3B JSON drafts as well as reconciliation CSV reports, so I can share them externally for review or filing."

## 2. API Contracts
The frontend will communicate with the backend through the following REST API endpoints:

### A. List Periods
- **Endpoint**: `GET /api/v1/gst/periods/`
- **Response**: Array of available periods.
```json
[
  {"period": "072026", "status": "validated"},
  {"period": "082026", "status": "draft"}
]
```

### B. Return Summaries
- **Endpoint**: `GET /api/v1/gst/summary/<fp>/`
- **Response**: Aggregated summary for GSTR-1 and GSTR-3B, including validation results.
```json
{
  "gstr1": {
    "b2b_total": 20000.0,
    "b2cs_total": 5000.0,
    "cdnr_total": 0.0,
    "hsn_count": 12
  },
  "gstr3b": {
    "outward_tax": 3600.0,
    "itc_available": 1080.0,
    "itc_reversed": 0.0,
    "net_itc": 1080.0
  },
  "validation": {
    "is_valid_for_export": true,
    "blocking_errors": [],
    "warnings": [
      {"code": "VAL-3B-002", "message": "Liability shortfall"}
    ],
    "info": []
  }
}
```

### C. Reconciliation Summary
- **Endpoint**: `GET /api/v1/gst/reconciliation/<fp>/`
- **Response**: ITC matching statistics and Deferred ITC lifecycle.
```json
{
  "summary": {
    "matched_count": 145,
    "missing_in_2b_count": 12,
    "mismatched_count": 3
  },
  "mismatch_breakdown": {
    "tax_rate_mismatch": 1,
    "period_mismatch": 2
  },
  "deferred_itc": {
    "opening_balance": 5000.0,
    "added_this_period": 450.0,
    "claimed_this_period": 0.0,
    "closing_balance": 5450.0
  }
}
```

### D. Export Endpoints
- **Endpoints**:
  - `GET /api/v1/gst/export/<fp>/gstr1/`
  - `GET /api/v1/gst/export/<fp>/gstr3b/`
  - `GET /api/v1/gst/export/<fp>/reconciliation/csv/`
- **Response**: Triggers an application/json or text/csv download stream directly to the browser.

## 3. Component Structure
The UI will be built as a modular React component tree.

- **`GSTDashboard` (Root)**
  - Manages the selected period state.
  - **`GSTPeriodSelector`**: A dropdown allowing the user to switch the active financial period.
  - **`GSTR1SummaryCard`**: Displays outward supply totals. Renders a colored validation badge (Green/Yellow/Red) and a "Download GSTR-1 JSON" button.
  - **`GSTR3BSummaryCard`**: Displays liability and net ITC totals. Renders a validation badge and a "Download GSTR-3B JSON" button.
  - **`ReconciliationWidget`**: Shows Matched, Missing, and Mismatched tiles, alongside the Deferred ITC summary (Opening, Added, Claimed, Closing).
  - **`ValidationPanel`**: A collapsible alerts panel listing Blocking Errors, Warnings, and Info messages. Auto-expands if the period contains any Blocking or Warning items.

## 4. Data Flow and State Management
- **State Management**: We will use a library like **React Query** (or standard SWR/Fetch hooks) to fetch and cache data. The selected `period` will be held in simple React state at the `GSTDashboard` level.
- **Flow**:
  1. User selects a period (e.g., `082026`).
  2. The `period` state updates, triggering React Query to fetch `/summary/082026/` and `/reconciliation/082026/`.
  3. While loading, skeleton loaders will display in the cards.
  4. Once data arrives, child components re-render with the aggregated metrics and validation statuses.
  5. If `blocking_errors` exist, the export buttons in the summary cards are disabled.

## 5. Validation State Visualization
- **Green Badge (Valid)**: `is_valid_for_export = true` and no warnings.
- **Yellow Badge (Warning)**: `is_valid_for_export = true`, but `warnings.length > 0`.
- **Red Badge (Blocked)**: `is_valid_for_export = false` (blocking errors exist).
- The **`ValidationPanel`** will group items by severity (Errors first, then Warnings, then Info).

## 6. Export Actions
- **Triggers**: Clicking "Download JSON" calls the respective export API endpoint.
- **UX Flow**: A confirmation modal will appear for JSON exports: *"Warning: These are draft working papers for review. Final filing must be done on the GST portal."*
- **Delivery**: The browser will trigger a native file download (`gstr3b_082026_draft.json`).

## 7. Edge Cases and Error Handling
- **No Data for Period**: Display a clean empty state graphic with the text: *"No GST data found for this period."*
- **Invalid Period (404)**: Fallback to the latest available period and show a toast warning.
- **API Failures (500)**: Display a red error banner at the top of the dashboard.
- **Export Failure**: Show a toast notification if the JSON/CSV generation fails on the backend.

## 8. Mock Data Strategy
We will reuse the robust mock data factories created during backend testing (`test_gstr3b_returns.py`). We will need 3 distinct mock scenarios available via a Django management command or setup script:
1. **Clean Period**: All matched, no warnings.
2. **Warnings Period**: Contains Liability Shortfall (Warning) and Missing in 2B entries.
3. **Blocked Period**: Contains Excess ITC (Blocking) and Tax Rate mismatches.

## 9. Future Extensions (Out of Scope for MVP)
- **Invoice-Level Drill-Down**: Clicking a mismatch count to view the exact invoices.
- **Inline Editing**: Fixing mismatches or correcting entries directly from the dashboard.
- **Multi-GSTIN Views**: Consolidating data across multiple legal entities or branches.
- **B1 Integration**: Real-time GSTR-2B syncing instead of relying on the Sandbox service.

## 10. Open Questions for Approval
1. **Layout**: Should GSTR-1, GSTR-3B, and Reconciliation all be visible on one scrolling page, or should they be separated into tabs? (Assumption for MVP: One scrolling dashboard page for a quick overview).
2. **Reconciliation Detail Level**: Is displaying just the summary counts (Matched/Mismatched/Missing) sufficient for the MVP UI, pushing the invoice-level details entirely to the CSV export?
3. **PDF Export**: Do we need a "Print Summary to PDF" feature for CA review, or is downloading the JSON + CSV enough for the MVP?
