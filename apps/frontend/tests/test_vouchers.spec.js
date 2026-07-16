const { test, expect } = require('@playwright/test');

test('test vouchers page', async ({ page }) => {
    test.setTimeout(60000);
    console.log("Navigating to /dashboard/accounts...");
    await page.goto("http://localhost:3000/dashboard/accounts");
    await page.waitForLoadState("networkidle");
    
    const url = page.url();
    console.log(`Current URL after redirect: ${url}`);
    
    await page.screenshot({ path: "/home/asta/.gemini/antigravity/brain/dbdaf420-1fe8-4e4f-b499-5df78ba8ea44/accounts_register.png" });
    console.log("Screenshot taken: accounts_register.png");
    
    console.log("Clicking first voucher row...");
    const row = page.locator("tbody tr").first();
    if (await row.isVisible()) {
        await row.click();
        await page.waitForSelector("div[role='dialog']", { state: "visible" });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "/home/asta/.gemini/antigravity/brain/dbdaf420-1fe8-4e4f-b499-5df78ba8ea44/voucher_panel.png" });
        console.log("Screenshot taken: voucher_panel.png");
        
        console.log("Clicking History tab...");
        await page.locator("button[role='tab']:has-text('System Data')").click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: "/home/asta/.gemini/antigravity/brain/dbdaf420-1fe8-4e4f-b499-5df78ba8ea44/voucher_history.png" });
        console.log("Screenshot taken: voucher_history.png");
    } else {
        console.log("No voucher rows found.");
    }
});
