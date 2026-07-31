import { test, expect } from './fixtures/test-setup';

test.describe('Margin Visibility Features', () => {

  test('admin can toggle margin visibility with Ctrl+Shift+M', async ({ billingPage, page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Setup
    await billingPage.goto();

    // Intercept PIN lookup to always return admin for this test
    await page.route('**/staff/lookup-by-pin/', async (route) => {
        console.log('PAGE LOG: MOCKED PIN LOOKUP');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ 
                id: 'mocked-admin-id', 
                role: 'admin', 
                name: 'Mocked Admin', 
                outletId: 'mocked-outlet-id',
                maxDiscount: 100,
                canEditRate: true
            })
        });
    });

    await billingPage.enterPin('1234');
    await page.waitForLoadState('networkidle');

    // 2. Add item so we can see row-level and total margin
    await billingPage.addMedicine('0001Pracitemol', 1);

    // 3. Verify margins are NOT visible initially
    await expect(page.getByText('Total Margin')).not.toBeVisible();
    await expect(page.getByText('Gross Profit')).not.toBeVisible();

    // 4. Toggle ON (Ctrl+Shift+M) - Ensure no input is focused
    await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+Shift+M');
    await page.waitForTimeout(500);

    // 5. Verify margins ARE visible now
    await expect(page.getByText('Total Margin')).toBeVisible();
    await expect(page.getByText('Gross Profit')).toBeVisible();

    // 6. Verify input focus guard (clicking in search field, pressing shortcut)
    const searchInput = page.getByPlaceholder('Search Medicine [F2]...').first();
    await searchInput.focus();
    await page.keyboard.press('Control+Shift+M');

    // 7. Margins should STILL be visible (shortcut did not fire to toggle them off)
    await expect(page.getByText('Total Margin')).toBeVisible();

    // 8. Toggle OFF (Ctrl+Shift+M) while body is focused
    await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    });
    await page.keyboard.press('Control+Shift+M');

    // 9. Verify margins are NOT visible again
    await expect(page.getByText('Total Margin')).not.toBeVisible();
  });

});
