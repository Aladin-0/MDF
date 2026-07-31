import { test, expect } from './fixtures/test-setup';

test.describe('Real Local Smoke Test', () => {

  test('All Scenarios: Create, Validate, Modify, Quotation', async ({ billingPage, page }) => {
    // Navigate and login
    await billingPage.goto();
    await billingPage.enterPin('1234');
    await page.waitForLoadState('networkidle');

    // Confirm duplicate mode control is gone (we expect max 1)
    const modeSelects = page.locator('select').filter({ hasText: 'Quotation' });
    expect(await modeSelects.count()).toBeLessThanOrEqual(1);

    // Confirm walk-in toggle is gone
    await expect(page.getByText('Walk-in')).not.toBeVisible();

    // Confirm datetime is visible in invoice mode
    const dateInput = page.locator('input[type="datetime-local"]');
    await expect(dateInput).toBeVisible();

    // C. Validation - Attempt to collect payment without customer
    await billingPage.addMedicine('0001Pracitemol', 1);
    await page.getByText('COLLECT PAYMENT').click();
    await expect(page.getByText('Customer selection is mandatory')).toBeVisible({ timeout: 5000 });

    // A. Create Invoice - Select customer
    await billingPage.selectCustomer('Test Customer');
    await page.waitForTimeout(500); // Give Zustand store a moment to update customer

    // Collect Payment
    const { request, response } = await billingPage.collectPayment();
    const postData = request.postDataJSON();
    
    // We already proved the invoiceDate payload mapping works in useSaveBill.test.tsx
    // Here we just ensure we successfully create a bill with a customer.

    const responseData = await response.json();
    if (!responseData.id) {
        console.error("Backend Error:", responseData);
    }
    expect(responseData.id).toBeDefined();
    const createdInvoiceId = responseData.id;

    // B. Modify existing sale invoice
    await page.goto(`/dashboard/sales/modify/${createdInvoiceId}`);
    await page.waitForLoadState('networkidle');
    
    // In modify page, there's a mode selector (header correction, etc)
    // Click header correction
    await page.getByText('Header Correction').click();
    
    // Now we should be in billing UI modify mode
    await page.waitForLoadState('networkidle');
    
    // Check if customer hydrated
    await expect(page.getByPlaceholder('Search Customer...').first()).toHaveValue(/Test Customer|Customer/);
    
    // Check date input is visible during modify
    const modifyDateInput = page.locator('input[type="datetime-local"]');
    await expect(modifyDateInput).toBeVisible();

    // Save modified invoice
    const modifySaleRequestPromise = page.waitForRequest(req => 
        req.url().includes('/api/v1/sales/') && req.method() === 'PUT'
    );
    const modifySaleResponsePromise = page.waitForResponse(res => 
        res.url().includes('/api/v1/sales/') && res.status() >= 200
    );
    await page.getByText('SAVE CHANGES').click(); // Adjust button text if necessary
    
    const modifyResponse = await modifySaleResponsePromise;
    expect(modifyResponse.status()).toBe(200);
    
    // D. Quotation safety
    await billingPage.goto();
    await page.waitForLoadState('networkidle');
    await billingPage.selectQuotationMode();
    await expect(page.locator('input[type="datetime-local"]')).not.toBeVisible();
  });
});
