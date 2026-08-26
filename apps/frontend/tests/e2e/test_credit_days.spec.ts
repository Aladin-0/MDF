import { test, expect } from '@playwright/test';

test.describe('Credit Days Customization Test', () => {


  test.skip('Create Credit 7 Days', async ({ page }) => {
    // We will intercept the API call to log the payload
    let capturedPayload = null;
    await page.route('**/api/v1/purchases/', async route => {
      capturedPayload = route.request().postDataJSON();
      await route.continue();
    });

    await page.goto('/dashboard/purchases/new');
    
    // Select party
    await page.click('button[role="combobox"]:has-text("Select party...")');
    await page.click('[role="option"]:nth-child(1)'); // Just pick the first

    // Select purchase type (Credit is default)
    // Select Credit Days = 7
    await page.click('button:has-text("30 Days")');
    await page.click('[role="option"]:has-text("7 Days")');
    
    // Add dummy item
    await page.click('button:has-text("Add Item")');
    await page.fill('input[placeholder="Search product..."]', 'Dolo');
    await page.waitForTimeout(500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.fill('input[name="items.0.batchNo"]', 'B123');
    await page.fill('input[name="items.0.expiryDate"]', '2029-12-31');
    await page.fill('input[name="items.0.qty"]', '10');
    await page.fill('input[name="items.0.purchaseRate"]', '50');
    await page.fill('input[name="items.0.mrp"]', '100');

    await page.fill('input[name="invoiceNo"]', 'INV-7DAYS');
    
    await page.click('button:has-text("Save Purchase")');
    
    await page.waitForResponse(response => response.url().includes('/api/v1/purchases/') && response.request().method() === 'POST');
    
    console.log('--- CREDIT 7 DAYS PAYLOAD ---');
    console.log(JSON.stringify(capturedPayload, null, 2));
  });

  test.skip('Create Cash', async ({ page }) => {
    let capturedPayload = null;
    await page.route('**/api/v1/purchases/', async route => {
      capturedPayload = route.request().postDataJSON();
      await route.continue();
    });

    await page.goto('/dashboard/purchases/new');
    
    // Select party
    await page.click('button[role="combobox"]:has-text("Select party...")');
    await page.click('[role="option"]:nth-child(1)');

    // Select purchase type (Cash)
    await page.click('button:has-text("Credit")');
    await page.click('[role="option"]:has-text("Cash")');
    
    // Add dummy item
    await page.click('button:has-text("Add Item")');
    await page.fill('input[placeholder="Search product..."]', 'Dolo');
    await page.waitForTimeout(500);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.fill('input[name="items.0.batchNo"]', 'B124');
    await page.fill('input[name="items.0.expiryDate"]', '2029-12-31');
    await page.fill('input[name="items.0.qty"]', '10');
    await page.fill('input[name="items.0.purchaseRate"]', '50');
    await page.fill('input[name="items.0.mrp"]', '100');

    await page.fill('input[name="invoiceNo"]', 'INV-CASH');
    
    await page.click('button:has-text("Save Purchase")');
    
    await page.waitForResponse(response => response.url().includes('/api/v1/purchases/') && response.request().method() === 'POST');
    
    console.log('--- CASH PAYLOAD ---');
    console.log(JSON.stringify(capturedPayload, null, 2));
  });
});
