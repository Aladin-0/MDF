const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Capture console logs from the page
    page.on('console', msg => {
        if (msg.text().includes('FORM VALIDATION ERRORS:')) {
            console.log('CAPTURED IN BROWSER CONSOLE:');
            // Since msg.args() are JSHandles, we need to evaluate them
            Promise.all(msg.args().map(arg => arg.jsonValue())).then(args => {
                console.log(JSON.stringify(args, null, 2));
            });
        }
    });

    // 1. Login
    await page.goto('http://localhost:3000/login');
    await page.type('input[type="email"]', 'admin@mediflow.com');
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();

    // 2. Go to purchase page
    await page.goto('http://localhost:3000/purchases/new');
    
    // 3. Fill the form exactly as the user said
    // "Party, Invoice No, Batch, Expiry, Pkg, Qty, Rate, GST all present"
    // Wait for form to load
    await page.waitForSelector('input[name="invoiceNo"]', {timeout: 10000});
    
    await page.type('input[name="invoiceNo"]', 'INV-TEST-123');
    
    // We need to select Party Ledger
    await page.click('button.w-full.justify-between'); // The ledger picker combobox
    await page.waitForSelector('[cmdk-item]', {timeout: 5000});
    await page.click('[cmdk-item]'); // Select first ledger

    // Add a product to the row (it defaults to empty item)
    // We just type into the product name?
    // Wait, the user said they "select a product" so search is working.
    // They clicked "Add Product" drawer? Or they just typed in the row?
    // Let's just try to submit empty or with partial data to trigger validation.
    
    // Wait for the UI to settle
    await page.waitForTimeout(2000);
    
    // Click Save Purchase
    await page.click('button[type="submit"]');
    
    // Wait a bit to let validation run and log
    await page.waitForTimeout(2000);
    
    await browser.close();
})();
