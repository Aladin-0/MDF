const { chromium } = require('playwright');

(async () => {
  console.log("Starting smoke test...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log("Navigating to app...");
    await page.goto('http://localhost:3000/login');
    
    // Attempt login if needed, or if already logged in / mocked
    // Note: I don't know the exact login flow, let's see what's on the page.
    console.log(await page.title());
    
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    await browser.close();
  }
})();
