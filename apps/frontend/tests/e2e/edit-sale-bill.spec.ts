import { test, expect } from './fixtures/test-setup';

test.describe('Phase 2: Edit Sale Bill Tests', () => {
  let saleId: string;
  const OUTLET_ID = 'd5349da2-dc06-405e-a5ee-6370c5e75c91';
  const BATCH_ID = '9b801458-865f-4e8e-af75-f81946b8c4e6';
  const PRODUCT_ID = 'bf88b0aa-e793-4674-a09d-941a1a956deb';

  test.beforeEach(async ({ api }) => {
    // 0. Create a doctor so we have a valid doctorId
    const docRes = await api.apiRequest('POST', '/doctors/', {
        name: 'Dr. John Doe',
        regNo: 'DOC123',
        outletId: OUTLET_ID
    });
    if (!docRes.ok()) {
        console.error("Doctor creation failed:", await docRes.text());
    }
    const docData = await docRes.json();
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
          productName: '0001Pracitemol',
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
    await page.goto(`/dashboard/sales/modify/${saleId}`);
    await page.waitForLoadState('networkidle');

    await Promise.all([
        page.waitForURL('**/billing'),
        page.getByText('Paid Bill Correction').first().click()
    ]);
    // Enter billing PIN (0000 for Hiralal)
    await expect(page.getByText('Enter Your PIN')).toBeVisible({ timeout: 5000 });
    for (const char of '0000') {
        await page.keyboard.press(char);
    }
    // In modify mode, the product name should appear in the cart after PIN
    await expect(page.getByText('0001Pracitemol')).toBeVisible({ timeout: 8000 });


    // 2. Verify Hydration
    await expect(page.getByText('Dr. John Doe').first()).toBeVisible();
    await expect(page.getByPlaceholder('Hospital Name...')).toHaveValue('General Hospital');
    await expect(page.getByTestId('cart-summary-items')).toContainText('1 Items');
    
    // Total should be 20
    await expect(page.getByTestId('grand-total-amount')).toContainText('20');

    // 3. Edit Quantity — click the product row to open InlineRowEditor
    await page.getByText('0001Pracitemol').click();
    
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
    
    await expect(page.getByText('Bill Saved Successfully!')).toBeVisible({ timeout: 8000 });

    // 5. Reload and Verify Persistence
    await page.goto(`/dashboard/sales/modify/${saleId}`);
    await page.waitForLoadState('networkidle');
    await Promise.all([
        page.waitForURL('**/billing'),
        page.getByText('Paid Bill Correction').first().click()
    ]);
    // Re-enter PIN after page reload
    await expect(page.getByText('Enter Your PIN')).toBeVisible({ timeout: 5000 });
    for (const char of '0000') {
        await page.keyboard.press(char);
    }
    await expect(page.getByText('0001Pracitemol')).toBeVisible({ timeout: 8000 });

    await expect(page.getByText('Dr. John Doe').first()).toBeVisible();
    await expect(page.getByTestId('grand-total-amount')).toContainText('30');
    
    // 6. Verify Audit History panel fetches without 404
    const historyBtn = page.getByRole('button', { name: /History/i });
    await expect(historyBtn).toBeVisible({ timeout: 5000 });
    await historyBtn.click();
    await expect(page.getByText('History')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Patient wanted one more strip')).toBeVisible({ timeout: 5000 });
  });
});
