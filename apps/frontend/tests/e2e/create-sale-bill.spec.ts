import { test, expect } from './fixtures/test-setup';

test.describe('Phase 1: Create Sale Bill Tests', () => {
  test('Create basic walk-in sale with single item', async ({ billingPage, page }) => {
    await billingPage.goto();
    await billingPage.enterPin('1234');
    await billingPage.addMedicine('0001Pracitemol', 1);

    const { request, response } = await billingPage.collectPayment();
    const postData = request.postDataJSON();
    
    expect(postData.items.length).toBe(1);
    expect(postData.items[0].qtyStrips).toBe(1);
    expect(postData.paymentMode).toBe('cash');
    expect(postData.customerId).toBeFalsy();
    expect(postData.doctorId).toBeFalsy();

    const responseData = await response.json();
    expect(responseData.id).toBeDefined();
    await expect(page.getByText('Bill Saved Successfully!')).toBeVisible({ timeout: 5000 });
  });

  test('Create sale with fractional/loose quantities and discount', async ({ billingPage, page }) => {
    await billingPage.goto();
    await billingPage.enterPin('1234');
    
    const productInput = page.getByPlaceholder('Search Medicine [F2]...').first();
    const searchResponsePromise = page.waitForResponse(response => 
      response.url().includes('/products/search/') && response.status() === 200
    );
    await productInput.fill('0001Pracitemol');
    await searchResponsePromise;
    await page.waitForLoadState('domcontentloaded');
    await productInput.press('Enter');

    const qtyLabel = page.getByText('Qty (Strips)', { exact: false }).first();
    const selectBatchLabel = page.getByText('Select a Batch:', { exact: true }).first();
    await qtyLabel.or(selectBatchLabel).waitFor({ state: 'visible', timeout: 5000 });
    if (await selectBatchLabel.isVisible()) {
      await page.keyboard.press('Enter');
    }
    await expect(qtyLabel).toBeVisible();

    const inputs = page.locator('input[type="number"]');
    await inputs.nth(0).fill('1'); // qty strips
    await inputs.nth(1).fill('5'); // qty loose
    
    // Discount defaults to percentage
    await inputs.nth(2).fill('10'); // discount value
    await inputs.nth(2).press('Enter');

    await expect(page.getByTestId('cart-summary-items')).toContainText('1 Items');

    const { request, response } = await billingPage.collectPayment();
    const postData = request.postDataJSON();
    
    expect(postData.items[0].qtyStrips).toBe(1);
    expect(postData.items[0].qtyLoose).toBe(5);
    expect(postData.items[0].discountPct).toBe(10);
    expect(response.status()).toBe(201);
  });

  test('Empty items rejected gracefully', async ({ billingPage, page }) => {
    await billingPage.goto();
    await billingPage.enterPin('1234');
    await expect(page.getByText('COLLECT PAYMENT')).toBeDisabled();
  });
});
