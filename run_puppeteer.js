const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    // Enable request interception
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url().includes('/api/v1/sales/') && request.method() === 'POST') {
            console.log("----- CAPTURED POST DATA -----");
            console.log(request.postData());
            console.log("------------------------------");
        }
        request.continue();
    });
    
    page.on('response', async response => {
        if (response.url().includes('/api/v1/sales/') && response.request().method() === 'POST') {
            console.log("RESPONSE STATUS:", response.status());
            try {
                const text = await response.text();
                console.log("RESPONSE BODY:", text);
            } catch (e) {}
        }
    });

    console.log("Navigating to login...");
    await page.goto('http://localhost:3000/auth/login');
    
    // Type credentials
    await page.waitForSelector('input[name="phone"]');
    await page.type('input[name="phone"]', '9999999991');
    await page.type('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    console.log("Waiting for dashboard...");
    await page.waitForNavigation();
    
    console.log("Navigating to billing...");
    await page.goto('http://localhost:3000/billing');
    
    console.log("Waiting for search...");
    await page.waitForSelector('input[placeholder*="Search products"]');
    
    // Add product
    await page.type('input[placeholder*="Search products"]', 'seed');
    // Wait for dropdown
    await page.waitForTimeout(1000);
    // Hit enter or click first item
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(1000); // Wait for batch modal
    await page.keyboard.press('Enter'); // Select first batch
    
    console.log("Clicking Save Bill...");
    // Find Save Bill button
    const buttons = await page.$$('button');
    for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && text.includes('SAVE BILL')) {
            await btn.click();
            break;
        }
    }
    
    await page.waitForTimeout(5000); // Wait for API response
    
    await browser.close();
})();
