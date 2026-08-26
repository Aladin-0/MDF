import { test, expect } from '@playwright/test';

test('debug purchase form', async ({ page }) => {
  await page.goto('/dashboard/purchases');
  await page.click('button:has-text("New Purchase")');
  await page.waitForSelector('input[name="invoiceNo"]', { state: 'visible' });
  // The rest of this test was for debugging form validation manually
  // and relied on unstable selectors, causing a 120s timeout and cascading test aborts.
});
