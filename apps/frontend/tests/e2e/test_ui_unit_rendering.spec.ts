import { test, expect } from '@playwright/test';

test.describe('Sales UI Unit Rendering', () => {

  test('conditionally renders Loose input based on product packType', async ({ page }) => {
    await page.goto('/billing');

    // Check if PIN overlay is present, if so enter 1234
    const pinOverlay = page.locator('[data-testid="pin-overlay"]').first();
    try {
        await pinOverlay.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('1234');
        await pinOverlay.waitFor({ state: 'hidden', timeout: 5000 });
    } catch (e) {}

    // Search for a real Strip Product (e.g., Paracetamol or Dolo)
    const searchInput = page.locator('input[placeholder*="Search Medicine" i]').first();
    await searchInput.fill('SEED-Paracetamol');
    await page.waitForTimeout(1000); // Wait for debounce and API
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Verify Strip UI
    await expect(page.getByText('Qty (Strips)')).toBeVisible();
    await expect(page.getByText('Loose')).toBeVisible();

    // Cancel out
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Search for a non-strip product (Hand Strap)
    await searchInput.fill('SEED-Hand Strap');
    await page.waitForTimeout(1000); // Wait for debounce and API
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');


    // Verify Box UI (Loose should be hidden)
    await expect(page.getByText('Loose')).toBeHidden();
  });
});
