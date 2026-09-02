# Agent Execution Plan - GST Daily Validation

## Phase 1: Safety & Configuration (Fixing Security Gaps)
**Agent**: Lead Implementation Agent
1. Fix `dashboard_views.py` by restoring `IsAuthenticated` and strictly filtering all queries (including `DeferredITCEntry`) by `request.user.outlet`.
2. Fix exporter views to fail gracefully instead of falling back to `Outlet.objects.first()` if the user has no outlet.
3. Move `ENABLE_GST_SANDBOX_LIVE_MODE` validation down into `SandboxGstProvider.__init__` so that background Celery tasks cannot bypass it.
4. Update Sandbox logs to redact raw payload strings if tokens are missing.
5. Fix breaking sandbox tests (removing `GST_ENV` legacy assertions).

## Phase 2: Transaction Correctness (Fixing Rule Gaps)
**Agent**: Lead Implementation Agent
1. Update Sale Snapshot logic to correctly evaluate `is_exempt` to properly classify nil-rated / exempt 0% pharmacy items instead of treating them as zero-rated exports.
2. Update Purchase Return (Debit Note) logic to include `original_invoice_id` in the snapshot JSON to fix CDNR linkage.
3. Build the `generate_gst_daily_scenarios` management command based on the data requirements laid out in `DAILY_SCENARIO_MATRIX.md`.

## Phase 3: Report Correctness (Fixing Export Gaps)
**Agent**: Lead Implementation Agent
1. Update `test_gst_template_integrity.py` by inspecting the official `GSTR3B_Excel_Utility_V5.6.xlsm` file, hashing it, and updating the manifest so tests pass.
2. Ensure canonical normalized structures are completely generated and matched for all daily reports.

## Phase 4: Automated QA
**Agent**: Lead Implementation Agent
1. Execute the 7-day test scenarios via the new management command.
2. Build the Evidence Package Generator that snapshots the database state into PDF/Excel files (sales register, purchase register, stock movement, GSTR-1, GSTR-3B).
3. Hash the results and save them to `docs/ca_review/gst_daily_validation/runs/YYYY-MM-DD/vNNN/`.
4. Run the full test suite again to guarantee `0 failures, 0 errors`.

## Phase 5: Human CA Gate
**Agent**: Lead Implementation Agent
1. Halt execution and present the Evidence Package (`v001`) and the Configuration Matrix to the human user.
2. Await explicit approval before touching the live sandbox.

## Phase 6 & 7: Live Sandbox Ops
**Agent**: Lead Implementation Agent
1. Perform exactly one Live OTP Request.
2. Perform exactly one Live GSTR-2B retrieval.
3. Verify idempotency and log everything.
