import { test, expect } from './fixtures/test-setup';

test.describe('MediFlow Quotation System Flow', () => {
  test('Create and convert quotation', async ({ billingPage, page }) => {
    // 1. Open billing page & enter PIN
    await billingPage.goto();
    await billingPage.enterPin('1234');

    // 2. Fill customer
    await billingPage.selectCustomer('Test Customer');
    
    // 3. Switch to Quotation Mode
    await billingPage.selectQuotationMode();

    // 4. Search item/medicine
    await billingPage.addMedicine('0001Pracitemol', 1);

    // 5. Save Quotation
    const { request, response } = await billingPage.saveQuotation();

    const postData = request.postDataJSON();
    expect(postData.items.length).toBe(1);
    
    const responseData = await response.json();
    expect(responseData.id).toBeDefined();
  });
});
