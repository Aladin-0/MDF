import { test, expect } from './fixtures/test-setup';

test.describe('Phase 2: Edit Sale Bill Tests', () => {
  let saleId: string;
  test.beforeEach(async ({ api }) => {
    // Dynamically fetch IDs
    const meRes = await api.apiRequest('GET', '/auth/me/');
    const meData = await meRes.json();
    const OUTLET_ID = meData.outletId;

    const prodRes = await api.apiRequest('GET', `/products/search/?q=test&outletId=${OUTLET_ID}&context=billing`);
    const prodData = await prodRes.json();
    const PRODUCT_ID = prodData.data[0].id;

    const batchRes = await api.apiRequest('GET', `/products/${PRODUCT_ID}/batches/?outletId=${OUTLET_ID}`);
    const batchData = await batchRes.json();
    const BATCH_ID = batchData[0].id;

    // 0. Create a doctor so we have a valid doctorId
    const docRes = await api.apiRequest('POST', '/doctors/', {
        name: 'Dr. John Doe',
        regNo: 'DOC123',
        outletId: OUTLET_ID
    });
    const docResponseBody = await docRes.text();
    expect(docRes.ok(), `Doctor creation failed with status ${docRes.status()}: ${docResponseBody}`).toBeTruthy();
    
    const docData = JSON.parse(docResponseBody);
    const doctorId = docData.data.id;

    // 1. Create a complex bill via API
    const res = await api.createSaleInvoice(OUTLET_ID, {
      cashPaid: 20,
      subtotal: 20,
      grandTotal: 20,
      doctorId: doctorId,
      hospitalName: 'General Hospital',
      items: [
        {
          batchId: BATCH_ID,
          productId: PRODUCT_ID,
          productName: 'test medicine',
          qtyStrips: 2,
          qtyLoose: 0,
          packSize: 16,
          rate: 10,
          mrp: 12,
          amount: 20,
          discountAmount: 0,
          discountPct: 0,
          taxableAmount: 20,
          gstRate: 0,
          igstAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          saleMode: 'mixed'
        }
      ]
    });
    saleId = res.id;
  });

  test('Edit flow UI hydration, modification and persistence', async ({ page, billingPage }) => {
    // 1. Open Modify Flow
    await page.goto(`/billing?edit=${saleId}`);
    await page.waitForLoadState('networkidle');
    // Enter billing PIN (1234 for admin)
    await expect(page.getByText('Enter Your PIN')).toBeVisible({ timeout: 5000 });
    for (const char of '1234') {
        await page.keyboard.press(char);
    }
    // In modify mode, the product name should appear in the cart after PIN
    await expect(page.getByText('test medicine')).toBeVisible({ timeout: 8000 });


    // 2. Verify Hydration
    await expect(page.getByText('Dr. John Doe').first()).toBeVisible();
    await expect(page.getByPlaceholder('Hospital Name...')).toHaveValue('General Hospital');
    await expect(page.getByTestId('cart-summary-items')).toContainText('1 Items');
    
    // Total should be 20
    await expect(page.getByTestId('grand-total-amount')).toContainText('20');

    // 3. Edit Quantity — click the product row to open InlineRowEditor
    await page.getByText('test medicine').click();
    
    // Wait for the inline editor to appear and clear + fill qty strips
    const inlineQtyInput = page.getByTestId('inline-qty-strips');
    await inlineQtyInput.waitFor({ state: 'visible', timeout: 5000 });
    await inlineQtyInput.click({ clickCount: 3 });
    await inlineQtyInput.fill('3');
    await inlineQtyInput.press('Enter');

    // Total should update to 3 * 10 = 30
    await expect(page.getByTestId('grand-total-amount')).toContainText('30');

    // 4. Save modifications — click Collect Payment which opens RevisionReasonModal
    const reqPromise = page.waitForRequest(request => 
        request.url().includes(`/api/v1/sales/${saleId}/revise/`) && request.method() === 'POST'
    );
    const resPromise = page.waitForResponse(response =>
        response.url().includes(`/api/v1/sales/${saleId}/revise/`) && response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: /COLLECT PAYMENT/i }).click();

    // The RevisionReasonModal should now be open
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Select a reason code from the dropdown
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Entry Error: Quantity' }).click();

    // Fill the explanation
    await page.getByPlaceholder('Briefly explain why this is being modified...').fill('Patient wanted one more strip');

    // Click Proceed
    await page.getByRole('button', { name: 'Proceed' }).click();

    // Wait for the API call and check response
    const [req, res] = await Promise.all([reqPromise, resPromise]);
    const reqBody = req.postData();
    const reviseResponseBody = await res.text();
    console.log('Revise request payload:', reqBody);
    console.log('Revise response status:', res.status(), reviseResponseBody.substring(0, 300));
    
    await expect(page.getByText('Bill Saved Successfully!').first()).toBeVisible({ timeout: 8000 });

    // 5. Reload and Verify Persistence
    await page.goto(`/billing?edit=${saleId}`);
    await page.waitForLoadState('networkidle');
    // Re-enter PIN after page reload
    await expect(page.getByText('Enter Your PIN')).toBeVisible({ timeout: 5000 });
    for (const char of '1234') {
        await page.keyboard.press(char);
    }
    await expect(page.getByText('test medicine').first()).toBeVisible({ timeout: 8000 });

    await expect(page.getByText('Dr. John Doe').first()).toBeVisible();
    await expect(page.getByTestId('grand-total-amount')).toContainText('30');
    
    // 6. Verify Audit History panel fetches without 404
    await page.goto(`/dashboard/sales/revisions/${saleId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Invoice History')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Patient wanted one more strip')).toBeVisible({ timeout: 5000 });
  });
});
