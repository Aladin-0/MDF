import { test, expect } from '@playwright/test';

test('debug purchase form', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'admin@mediflow.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/billing*');

  // Go to purchase page
  await page.goto('http://localhost:3000/purchases/new');
  
  // Wait for the invoice input to be ready
  await page.waitForSelector('input[name="invoiceNo"]', { state: 'visible' });

  // Add the form values to trigger validation error
  await page.fill('input[name="invoiceNo"]', 'INV-123');

  // Select Party Ledger
  await page.click('button.w-full.justify-between');
  await page.click('[cmdk-item]'); // Select first item

  // Select product
  await page.click('button:has-text("Add Product")'); // If there is an add product button
  // Actually the row is default empty, so we need to add product
  await page.fill('td:nth-child(2) input', 'seed'); // product name search? 
  await page.waitForTimeout(1000);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  
  // Fill required fields
  await page.fill('input[name="items.0.batchNo"]', 'B123');
  await page.fill('input[name="items.0.expiryDate"]', '2026-12-31');
  await page.fill('input[name="items.0.pkg"]', '1');
  await page.fill('input[name="items.0.qty"]', '10');
  await page.fill('input[name="items.0.purchaseRate"]', '50');
  await page.fill('input[name="items.0.gstRate"]', '12');

  // Listen to console
  page.on('console', msg => {
      if (msg.text().includes('FORM VALIDATION')) {
          console.log(msg.text());
          msg.args().forEach(arg => arg.jsonValue().then(v => console.log(JSON.stringify(v, null, 2))));
      }
  });

  // Submit
  await page.click('button:has-text("Save Purchase")');
  await page.waitForTimeout(1000);
});
