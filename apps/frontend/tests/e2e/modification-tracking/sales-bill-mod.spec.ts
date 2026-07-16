import { test, expect } from '../fixtures/test-setup';
import * as fs from 'fs';
import * as path from 'path';

// Fixed test constants — confirmed against live DB
const OUTLET_ID = 'd5349da2-dc06-405e-a5ee-6370c5e75c91';
const BATCH_ID = '9b801458-865f-4e8e-af75-f81946b8c4e6';       // HAV16 batch
const PRODUCT_ID = 'bf88b0aa-e793-4674-a09d-941a1a956deb';     // 0001Pracitemol
const CUSTOMER_ID = 'c65dacc8-6bd3-4c61-98c7-789085e0e21a';   // Samdhish

// Helper: build a token from a saved auth file
function loadToken(authFileName: string): string {
  const authPath = path.join(__dirname, '..', '.auth', `${authFileName}.json`);
  const authState = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const cookie = authState.cookies.find((c: any) => c.name === 'access_token');
  if (!cookie?.value) throw new Error(`No access_token in ${authFileName}.json`);
  return cookie.value;
}

// Helper: build a standard sale item payload
function buildSaleItem(qtyStrips: number, rate = 10, batchId = BATCH_ID) {
  const totalAmount = rate * qtyStrips;
  return {
    batchId: batchId,
    productId: PRODUCT_ID,
    qtyStrips,
    qtyLoose: 0,
    rate,
    discountPct: 0,
    gstRate: 0,
    taxableAmount: totalAmount,
    gstAmount: 0,
    totalAmount
  };
}

test.describe('Sales Bill Modification Tracking', () => {
  test.describe.configure({ mode: 'serial' });

  // ─────────────────────────────────────────────────────────────────
  // Category A: Core CRUD & Tracking
  // ─────────────────────────────────────────────────────────────────
  test.describe('Category A: Core CRUD & Tracking', () => {

    test('Create a new record — assert no false modified history', async ({ api }) => {
      // Create a fresh sale
      const sale = await api.createSaleInvoice(OUTLET_ID, { grandTotal: 10, cashPaid: 10 });
      const saleId = sale.id;

      // Immediately check revision history — must be empty
      const revResp = await api.apiRequest('GET', `/audit/revisions/sale/${saleId}/?outletId=${OUTLET_ID}`);
      const revData = await revResp.json();
      expect(revResp.status()).toBe(200);
      expect(revData.revisions.length).toBe(0);
    });

    test('Edit a single header field — assert exactly one revision entry with diff captured', async ({ api }) => {
      // Create a fresh sale
      const sale = await api.createSaleInvoice(OUTLET_ID, { grandTotal: 10, cashPaid: 10 });
      const saleId = sale.id;

      // Fetch the invoice to build a valid payload
      const invoiceResp = await api.apiRequest('GET', `/sales/${saleId}/?outletId=${OUTLET_ID}`);
      const invoice = await invoiceResp.json();
      expect(invoiceResp.status()).toBe(200);

      // Perform a header correction: change invoice date
      const newDate = new Date('2024-03-15T00:00:00Z').toISOString();
      const reviseResp = await api.apiRequest('POST', `/sales/${saleId}/revise/`, {
        outletId: OUTLET_ID,
        revisionAction: 'header_correction',
        revisionReasonCode: 'customer_request',
        revisionReasonText: 'Backdated entry correction',
        invoiceDate: newDate,
      });
      expect(reviseResp.status(), `header_correction failed: ${await reviseResp.text()}`).toBe(200);

      // Assert exactly 1 revision exists
      const revResp = await api.apiRequest('GET', `/audit/revisions/sale/${saleId}/?outletId=${OUTLET_ID}`);
      const revData = await revResp.json();
      expect(revData.revisions.length).toBe(1);

      const rev = revData.revisions[0];
      expect(rev.revision_type).toBe('header_correction');
      // Diff must capture the date change
      expect(rev.diff_summary_json.header.invoice_date, 'invoice_date diff missing').toBeTruthy();
      expect(rev.diff_summary_json.header.invoice_date.new).toContain('2024-03-15');
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Category B: Side-Effect Correctness (stock math)
  // ─────────────────────────────────────────────────────────────────
  test.describe('Category B: Side-Effect Correctness', () => {

    test('Edit stock-affecting record — stock change is mathematically correct', async ({ api }) => {
      // Step 1: Create a credit (unpaid) sale with 1 strip — eligible for direct_revise
      const saleResp = await api.apiRequest('POST', '/sales/', {
        outletId: OUTLET_ID,
        paymentMode: 'credit',
        cashPaid: 0, upiPaid: 0, cardPaid: 0,
        creditGiven: 10,
        subtotal: 10, discountAmount: 0, taxableAmount: 10,
        cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
        cgst: 0, sgst: 0, igst: 0, roundOff: 0,
        grandTotal: 10,
        customerId: CUSTOMER_ID,
        items: [buildSaleItem(1, 10, BATCH_ID)],
      });
      expect(saleResp.status(), `Failed to create credit sale: ${await saleResp.text()}`).toBe(201);
      const sale = await saleResp.json();
      const saleId = sale.id;

      // Step 2: Capture batch stock right before revise to avoid concurrency flakes
      const batchBeforeRevise = await api.apiRequest(
        'GET', `/products/${PRODUCT_ID}/batches/?outletId=${OUTLET_ID}`
      );
      const batchesBeforeReviseData = await batchBeforeRevise.json();
      const targetBatchBeforeRevise = batchesBeforeReviseData.find((b: any) => b.id === BATCH_ID);
      const stockBeforeRevise: number = targetBatchBeforeRevise.qtyStrips;

      // Step 3: Use direct_revise to increase quantity from 1→2 strips
      const reviseResp = await api.apiRequest('POST', `/sales/${saleId}/revise/`, {
        outletId: OUTLET_ID,
        revisionAction: 'direct_revise',
        revisionReasonCode: 'correction',
        revisionReasonText: 'Quantity was entered incorrectly — should have been 2',
        paymentMode: 'credit',
        cashPaid: 0, upiPaid: 0, cardPaid: 0,
        creditGiven: 20,
        subtotal: 20, discountAmount: 0, taxableAmount: 20,
        cgstAmount: 0, sgstAmount: 0, igstAmount: 0,
        cgst: 0, sgst: 0, igst: 0, roundOff: 0,
        grandTotal: 20,
        customerId: CUSTOMER_ID,
        items: [buildSaleItem(2, 10, BATCH_ID)],   // was 1, now 2
      });
      expect(reviseResp.status(), `direct_revise failed: ${await reviseResp.text()}`).toBe(200);

      // Step 4: Assert stock dropped by 1 (net: -1 from immediately before revise)
      const batchAfterRevise = await api.apiRequest(
        'GET', `/products/${PRODUCT_ID}/batches/?outletId=${OUTLET_ID}`
      );
      const batchesAfterRevise = await batchAfterRevise.json();
      const targetAfterRevise = batchesAfterRevise.find((b: any) => b.id === BATCH_ID);
      const stockAfterRevise: number = targetAfterRevise.qtyStrips;
      // After revising from 1→2 strips, stock drops by 1 more compared to stockBeforeRevise
      expect(stockAfterRevise).toBe(stockBeforeRevise - 1);

      // Step 5: Verify revision history captures the item change
      const revResp = await api.apiRequest('GET', `/audit/revisions/sale/${saleId}/?outletId=${OUTLET_ID}`);
      const revData = await revResp.json();
      expect(revData.revisions.length).toBe(1);
      const rev = revData.revisions[0];
      // Items modified section must record the qty change
      expect(rev.diff_summary_json.items_modified.length).toBeGreaterThan(0);
      const itemChange = rev.diff_summary_json.items_modified[0];
      // The qty_strips changed from 1 to 2
      expect(itemChange.changes.qty_strips.old).toBe(1);
      expect(itemChange.changes.qty_strips.new).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Category C: Permission & Security
  // ─────────────────────────────────────────────────────────────────
  test.describe('Category C: Permission & Security', () => {

    test('Unauthorized user cannot edit sales — 403 and no revision created', async ({ api, page }) => {
      // Setup: create a sale under the admin account
      const sale = await api.createSaleInvoice(OUTLET_ID, { grandTotal: 10, cashPaid: 10 });
      const saleId = sale.id;

      // Goswami is a billing_staff with can_modify_draft_bill only — 
      // he CANNOT do header_correction (requires can_correct_header_fields)
      const goswamiToken = loadToken('billing_staff');

      const url = `http://localhost:8000/api/v1/sales/${saleId}/revise/`;
      const unauthorizedResp = await page.request.post(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${goswamiToken}`,
        },
        data: {
          outletId: OUTLET_ID,
          revisionAction: 'header_correction',
          revisionReasonCode: 'customer_request',
          revisionReasonText: 'Attempted unauthorized edit',
          invoiceDate: new Date('2023-01-01').toISOString(),
        },
      });

      // Backend MUST reject with 403
      expect(unauthorizedResp.status()).toBe(403);
      const body = await unauthorizedResp.json();
      expect(body.detail).toContain('Permission denied');

      // The sale must remain unchanged — fetch it and verify
      const saleCheckResp = await api.apiRequest('GET', `/sales/${saleId}/?outletId=${OUTLET_ID}`);
      const saleCheck = await saleCheckResp.json();
      // Invoice date should be today's date (unchanged from creation), not 2023-01-01
      expect(saleCheck.invoiceDate).not.toContain('2023-01-01');

      // Revision history must be empty — no false revision created
      const revResp = await api.apiRequest('GET', `/audit/revisions/sale/${saleId}/?outletId=${OUTLET_ID}`);
      const revData = await revResp.json();
      expect(revData.revisions.length).toBe(0);
    });

    test('Granular permission explicitly blocks action regardless of role', async ({ api, page }) => {
      // Create a fresh sale under admin
      const sale = await api.createSaleInvoice(OUTLET_ID, { grandTotal: 10, cashPaid: 10 });
      const saleId = sale.id;

      // Jadhav is a Manager (role=manager) with canEditSales=true, BUT lacks
      // can_correct_header_fields — so header_correction must be 403 for him too.
      // This proves granular flag enforcement, not just authentication.
      const managerToken = loadToken('manager');

      const url = `http://localhost:8000/api/v1/sales/${saleId}/revise/`;
      const resp = await page.request.post(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${managerToken}`,
        },
        data: {
          outletId: OUTLET_ID,
          revisionAction: 'header_correction',
          revisionReasonCode: 'customer_request',
          revisionReasonText: 'Should fail — manager lacks can_correct_header_fields',
        },
      });

      // Manager role alone is not sufficient — granular flag required
      expect(resp.status()).toBe(403);

      // No revision must have been created
      const revResp = await api.apiRequest('GET', `/audit/revisions/sale/${saleId}/?outletId=${OUTLET_ID}`);
      const revData = await revResp.json();
      expect(revData.revisions.length).toBe(0);
    });
  });
});
