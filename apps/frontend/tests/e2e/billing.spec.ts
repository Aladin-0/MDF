import { test, expect } from './fixtures/test-setup';

test.describe('MediFlow Billing System Flow', () => {
  // Use storageState by default in playwright config, so login is skipped
  
  test('Complete billing journey', async ({ billingPage, page }) => {
    // 1. Open billing page
    await billingPage.goto();

    // 2. Enter PIN
    await billingPage.enterPin('1234');

    // 3. Fill customer
    await billingPage.selectCustomer('Test Customer');

    // 4. Search item/medicine
    await billingPage.addMedicine('0001Pracitemol', 1);

    // 5. Checkout
    // Wait for internal calculation to settle before clicking collect payment
    // We can rely on the final amount UI explicitly loading
    const finalAmountEl = page.locator('.text-5xl.font-black.tracking-tight');
    await expect(finalAmountEl).toBeVisible();

    const { request, response } = await billingPage.collectPayment();

    // Verify payload
    const postData = request.postDataJSON();
    expect(postData.items.length).toBe(1);
    expect(postData.paymentMode).toBe('cash');
    expect(postData.cashPaid).toBeGreaterThan(0);
    
    // Verify successful API completion
    const responseData = await response.json();
    expect(responseData.id).toBeDefined();

    // Verify UI success state
    await expect(page.getByText('Bill Saved Successfully!')).toBeVisible({ timeout: 5000 });
  });
});
