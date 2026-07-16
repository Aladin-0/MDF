const { test, expect } = require('@playwright/test');

test('test voucher edit flow', async ({ page }) => {
    test.setTimeout(60000);
    console.log("Navigating to /dashboard/accounts/vouchers...");
    await page.goto("http://localhost:3000/dashboard/accounts/vouchers");
    await page.waitForLoadState("networkidle");
    
    // Check if there are vouchers
    const row = page.locator("tbody tr").first();
    if (!(await row.isVisible())) {
        console.log("No vouchers to edit. Skipping test.");
        return;
    }

    await row.click();
    await page.waitForSelector("div[role='dialog']", { state: "visible" });
    
    // Click Edit button
    console.log("Clicking Edit button in details modal...");
    await page.getByText("Edit").click();
    
    // We should be on ModifyVoucherPage. Wait for the reason input.
    console.log("Waiting for Modify Voucher page...");
    await page.waitForURL(/.*\/modify\/.*/);
    
    // Fill reason code and text
    await page.locator("button[role='combobox']").click();
    await page.getByText("Data Correction").click(); // or any valid reason code
    await page.getByPlaceholder("Explain why you are modifying this voucher").fill("Playwright e2e test edit");
    
    // Click Proceed
    await page.getByRole('button', { name: 'Proceed to Edit' }).click();
    
    // Now we should be on Voucher Entry page
    console.log("Waiting for Voucher Entry page...");
    await page.waitForURL(/.*\/voucher-entry\?editId=.*/);
    await page.waitForSelector("text=Voucher Entry", { state: "visible" });
    
    const saveButton = page.getByRole('button', { name: 'Save Voucher' });
    await expect(saveButton).toBeVisible();
    
    // Wait a bit for React to hydrate bill amounts etc
    await page.waitForTimeout(2000);
    
    console.log("Saving edited voucher...");
    await saveButton.click();
    
    // Should redirect back to /dashboard/accounts/vouchers
    await page.waitForURL("**/dashboard/accounts/vouchers*");
    console.log("Successfully redirected back to voucher list.");
});
