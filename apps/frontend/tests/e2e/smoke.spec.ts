import { test, expect } from '@playwright/test';

test.describe('MediFlow E2E Smoke Tests', () => {

  test('create-sale-bill', async ({ page }) => {
    // 1. Navigate to billing POS
    await page.goto('/billing');
    
    // Check if PIN overlay is present, if so enter 1234
    const pinOverlay = page.locator('[data-testid="pin-overlay"]').first();
    try {
        await pinOverlay.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('1234');
        await pinOverlay.waitFor({ state: 'hidden', timeout: 5000 });
    } catch (e) {
        // Overlay might not appear if session cached
    }

    // 3. Add product using the POS shortcut
    const searchInput = page.locator('input[placeholder*="Search Medicine" i]').first();
    await searchInput.waitFor({ state: 'visible' });
    
    await searchInput.fill('test');
    await page.waitForTimeout(2000); // Wait for debounce and search results
    
    // Press down to hover the first result, then Enter to select
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    // Wait for quick add widget to appear (Batch list)
    await page.waitForTimeout(1000);
    // Press enter to select first batch (auto-focused)
    await page.keyboard.press('Enter');
    
    // Wait for qty input
    await page.waitForTimeout(1000);
    await page.keyboard.type('2'); // Qty 2
    await page.keyboard.press('Enter'); // Commit add

    // 5. Finalize bill
    const checkoutButton = page.locator('button:has-text("COLLECT PAYMENT"), button:has-text("Save")').first();
    await checkoutButton.waitFor({ state: 'visible' });
    await checkoutButton.click();

    // 6. Assert success
    const successHeading = page.locator('h2').filter({ hasText: /Bill Saved Successfully!/i }).first();
    await expect(successHeading).toBeVisible({ timeout: 10000 });
  });

  test('billing-ui-safety-hotkeys', async ({ page }) => {
    // Navigate to billing POS
    await page.goto('/billing');
    
    // Check if PIN overlay is present, if so enter 1234
    const pinOverlay = page.locator('[data-testid="pin-overlay"]').first();
    try {
        await pinOverlay.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('1234');
        await pinOverlay.waitFor({ state: 'hidden', timeout: 5000 });
    } catch (e) {
        // Overlay might not appear if session cached
    }

    const searchInput = page.locator('input[placeholder*="Search Medicine" i]').first();
    await searchInput.waitFor({ state: 'visible' });
    
    // Focus search and rapidly type n, s, c
    await searchInput.focus();
    await searchInput.type('n', { delay: 50 });
    await searchInput.type('s', { delay: 50 });
    await searchInput.type('c', { delay: 50 });
    
    // Wait briefly to see if any dialog or navigation happens
    await page.waitForTimeout(1000);
    
    // Assert we are still on the billing page and no modals opened
    await expect(page).toHaveURL(/\/billing/);
    const dialogs = page.locator('dialog, [role="dialog"]');
    await expect(dialogs).toHaveCount(0);
  });

  test('edit-sale-bill', async ({ page }) => {
    // 1. Navigate to sales list
    await page.goto('/dashboard/sales');
    
    // 2. Click the first sale to edit
    await page.waitForSelector('table tbody tr', { state: 'visible' });
    const firstSaleRow = page.locator('table tbody tr').first();
    await firstSaleRow.click();
    
    // Wait for view button inside the first row
    const viewBtn = firstSaleRow.locator('button[title="View Invoice"]').first();
    await viewBtn.waitFor({ state: 'visible' });
    await viewBtn.click();
    
    // Wait for modal, then click edit
    const editBtn = page.locator('button:has-text("Edit"), button:has-text("Modify")').first();
    await editBtn.waitFor({ state: 'visible' });
    await editBtn.click();

    // Wait for edit page to load
    await page.waitForURL(/\/dashboard\/sales\/modify\//);
    
    // Click Revise button
    const reviseBtn = page.locator('button:has-text("Direct Revise"), button:has-text("Commercial Correction"), button:has-text("Paid Bill Correction")').first();
    await reviseBtn.waitFor({ state: 'visible' });
    await reviseBtn.click();
    
    // Wait for POS to load
    await page.waitForURL(/\/billing/);
    
    // Check if PIN overlay is present, if so enter 1234
    const pinOverlay = page.locator('[data-testid="pin-overlay"]').first();
    try {
        await pinOverlay.waitFor({ state: 'visible', timeout: 3000 });
        await page.keyboard.type('1234');
        await pinOverlay.waitFor({ state: 'hidden', timeout: 5000 });
    } catch (e) {
        // Overlay might not appear if session cached
    }
    
    // 3. Open inline editor by clicking the first item in the cart
    const firstCartRow = page.locator('tbody.divide-y.divide-slate-200.bg-white tr').first();
    await firstCartRow.waitFor({ state: 'visible' });
    await firstCartRow.click();
    
    // 4. Modify quantity
    const qtyInput = page.getByTestId('inline-qty-strips').first();
    await qtyInput.waitFor({ state: 'visible' });
    await qtyInput.fill('3');
    await qtyInput.press('Enter');
    
    // 5. Save
    const saveButton = page.locator('button:has-text("COLLECT PAYMENT"), button:has-text("SAVE")').first();
    await saveButton.click();

    // 5. Assert success
    const toast = page.locator('text=/Bill Saved Successfully!|saved|success/i').first();
    await expect(toast).toBeVisible({ timeout: 10000 });
  });

  test('create-purchase', async ({ page }) => {
    // 1. Navigate to Purchases
    await page.goto('/dashboard/purchases');
    await page.locator('button:has-text("New Purchase")').first().click();

    // 2. Fill minimum valid header details
    // Select party (vendor)
    const vendorCombobox = page.locator('button:has-text("Select party ledger...")').first();
    await vendorCombobox.waitFor({ state: 'visible' });
    await vendorCombobox.click();

    const vendorSearchInput = page.locator('input[placeholder="Type to search..."]').first();
    await vendorSearchInput.waitFor({ state: 'visible' });
    await vendorSearchInput.fill('test supplier');
    
    // Wait for the ledger item button to appear and click it
    const supplierOption = page.locator('button:has-text("test supplier")').first();
    await supplierOption.waitFor({ state: 'visible', timeout: 5000 });
    await supplierOption.click();

    // Fill Invoice number
    const invoiceNo = page.locator('input[name="invoiceNo"]').first();
    if (await invoiceNo.isVisible()) {
        await invoiceNo.fill('INV-' + Date.now());
    }

    // Listen for console events to debug form validation failure
    page.on('console', msg => console.log(msg.text()));
    page.on('response', async res => {
        if (res.status() === 400) {
            console.log('400 BAD REQUEST RESPONSE:', await res.text());
        }
    });
    
    const productInput = page.locator('input[placeholder*="Search product" i]').first();
    if (await productInput.isVisible()) {
        await productInput.fill('test medicine');
        await page.keyboard.press('Escape');
        
        // Fill basic required values like batch, pkg, qty, rate, mrp
        await page.locator('input[placeholder="Batch No"]').first().fill('B123');
        await page.locator('input[placeholder*="MM/YY"]').first().fill('12/25');
        const numberInputs = page.locator('table tbody tr:first-child input[type="number"]');
        await numberInputs.nth(0).fill('10'); // Pkg
        await numberInputs.nth(1).fill('100'); // Qty
        await numberInputs.nth(3).fill('10'); // purchaseRate
        await numberInputs.nth(6).fill('15'); // mrp
    }

    // 3. Submit (use force to bypass potential toast overlays)
    const submitButton = page.locator('button:has-text("Save Purchase"), button:has-text("Update Purchase"), button:has-text("Submit")').first();
    await submitButton.click({ force: true });

    // 6. Assert success redirect to purchases list
    await expect(page).toHaveURL(/\/dashboard\/purchases(\?.*)?$/);
    
    // Verify the newly created purchase is visible in the list
    await expect(page.locator('text="test supplier"').first()).toBeVisible({ timeout: 10000 });
  });
  test('edit-purchase', async ({ page }) => {
    // 1. Navigate to Purchases list
    await page.goto('/dashboard/purchases');

    // 2. Click the first purchase's View button
    await page.waitForSelector('table tbody tr', { state: 'visible' });
    const firstRow = page.locator('table tbody tr').first();
    
    const viewBtn = firstRow.locator('button:has-text("View")').first();
    await viewBtn.waitFor({ state: 'visible' });
    await viewBtn.click();

    // 3. Click Edit inside the modal
    const editBtn = page.locator('button:has-text("Edit")').first();
    await editBtn.waitFor({ state: 'visible' });
    await editBtn.click();

    // 4. Wait for edit form
    const reasonDropdown = page.locator('select:has(option[value="QTY_CORRECTION"])').first();
    await reasonDropdown.waitFor({ state: 'visible' });

    // 5. Change a quantity and ensure product name is set
    const productInput = page.locator('input[placeholder*="Search product" i]').first();
    if (await productInput.isVisible()) {
        await productInput.fill('test medicine edited');
        await page.keyboard.press('Escape');
    }
    
    const qtyInput = page.locator('input[placeholder="Qty"]').first();
    await qtyInput.waitFor({ state: 'visible' });
    await qtyInput.fill('15');

    // 6. Fill revision reason
    await reasonDropdown.selectOption('QTY_CORRECTION');
    const reasonText = page.locator('textarea[placeholder*="Explain why"]').first();
    await reasonText.fill('Fixing quantity typo in smoke test');

    // 7. Submit
    const submitButton = page.locator('button:has-text("Update Purchase")').first();
    await submitButton.click({ force: true });

    // 8. Assert success by checking if we returned to the list view (New Purchase button is visible)
    const newPurchaseBtn = page.locator('button:has-text("New Purchase")').first();
    await expect(newPurchaseBtn).toBeVisible({ timeout: 10000 });
  });

});
