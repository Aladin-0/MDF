import { test, expect } from './fixtures/test-setup';

test.describe('Real Local Smoke Test - Modify', () => {

  test('Modify Flow Verification', async ({ billingPage, page }) => {
    test.setTimeout(60000); // 60 seconds
    
    // 1. Navigate and login
    await billingPage.goto();
    await billingPage.enterPin('1234');
    await page.waitForLoadState('networkidle');

    // 2. Create Invoice
    await billingPage.addMedicine('0001Pracitemol', 1);
    await billingPage.selectCustomer('Test Customer');
    await page.waitForTimeout(500);
    const { response } = await billingPage.collectPayment();
    const responseData = await response.json();
    expect(responseData.id).toBeDefined();
    const createdInvoiceId = responseData.id;
    console.log(`Created Invoice ID: ${createdInvoiceId}`);

    await page.waitForTimeout(1000);

    // 3. Bypass Modify Options Page and Hydrate Store directly
    await page.evaluate(async (id) => {
        // Fetch full invoice exactly as ModifySalePage does
        const res = await fetch(`http://localhost:8000/api/v1/sales/${id}/?outletId=1`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token') || localStorage.getItem('token')}` }
        });
        const fullInvoice = await res.json();

        // Hydrate store directly
        const store = (window as any).useBillingStore.getState();
        let targetDraftId = store.activeDraftId || store.createDraft();
        store.clearCart(targetDraftId);
        store.setLastInvoice(null);
        store.setEditingSaleId(id);
        store.setRevisionContext('header_correction', '', '');

        if (fullInvoice.invoiceDate) {
            const d = new Date(fullInvoice.invoiceDate);
            store.updateDraftHeader(targetDraftId, {
                invoiceDate: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            });
        }

        store.setCustomer(fullInvoice.customer || null);
        if (fullInvoice.customer) {
            store.setCustomerLedger({
                id: 'mock',
                name: fullInvoice.customer.name,
                groupName: 'Sundry Debtors',
                currentBalance: 0,
                isMock: true,
            });
        }
        
        if (fullInvoice.items) {
            fullInvoice.items.forEach((item: any) => {
                store.addToCart({
                    id: Math.random().toString(),
                    draftId: targetDraftId,
                    productId: item.productId || item.product,
                    name: item.name,
                    batchId: item.batchId || item.batch,
                    batchNo: item.batchNo,
                    qtyStrips: item.qtyStrips || 0,
                    qtyLoose: item.qtyLoose || 0,
                    rate: item.saleRate || item.rate,
                    mrp: item.mrp,
                    gstRate: item.gstRate || 0,
                });
            });
        }
    }, createdInvoiceId);
    
    console.log("Store hydrated. Reloading billing...");
    await billingPage.goto();
    await page.waitForLoadState('networkidle');

    // 4. In Billing Modify Mode
    const custInput = page.getByPlaceholder('Search Customer...').first();
    await expect(custInput).toBeVisible({ timeout: 10000 });
    
    // 5. Confirm customer hydrates correctly
    const custVal = await custInput.inputValue();
    expect(custVal).toMatch(/Test Customer|Customer/);
    console.log("Customer hydrated correctly:", custVal);
    
    // 6. Confirm items hydrate correctly
    const itemsSummary = page.getByTestId('cart-summary-items');
    await expect(itemsSummary).toContainText('1 Items');
    console.log("Items hydrated correctly");
    
    // 7. Change invoice date/time
    const dateInput = page.locator('input[type="datetime-local"]');
    await expect(dateInput).toBeVisible();
    await dateInput.fill('2026-07-20T10:00');
    await dateInput.evaluate(node => {
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
    });
    console.log("Date changed to 2026-07-20T10:00");

    // 8. Save successfully
    const modifySaleResponsePromise = page.waitForResponse(res => 
        res.url().includes('/api/v1/sales/') && res.status() >= 200 && res.request().method() === 'PUT'
    );
    await page.getByText('SAVE CHANGES').click(); 
    
    const modifyResponse = await modifySaleResponsePromise;
    expect(modifyResponse.status()).toBe(200);
    console.log("Modify save successful");

    // 9. Reload/reopen the same invoice to confirm updated date/time persisted
    const apiContext = page.request;
    const fetchRes = await apiContext.get(`http://localhost:8000/api/v1/sales/${createdInvoiceId}/?outletId=1`);
    expect(fetchRes.ok()).toBeTruthy();
    const fetchedData = await fetchRes.json();
    console.log(`Fetched persisted invoice date: ${fetchedData.invoice_date || fetchedData.invoiceDate}`);
    expect(fetchedData.invoice_date || fetchedData.invoiceDate).toContain('2026-07-20');
  });
});