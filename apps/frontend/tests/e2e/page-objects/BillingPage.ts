import { Page, expect } from '@playwright/test';

export class BillingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/billing');
  }

  async enterPin(pin: string = '1234') {
    await expect(this.page.getByText('Enter Your PIN')).toBeVisible();
    for (const char of pin) {
      await this.page.keyboard.press(char);
    }
    await expect(this.page.getByText('Enter Your PIN')).not.toBeVisible();
    await expect(this.page.getByText('Walk-in / Cash Sale')).toBeVisible();
  }

  async selectCustomer(name: string) {
    const custInput = this.page.getByPlaceholder('Search Customer...').first();
    await custInput.fill(name);
    await custInput.blur();
  }

  async selectQuotationMode() {
    const modeSelect = this.page.locator('select').filter({ hasText: 'Quotation / Estimate' });
    await modeSelect.selectOption('quotation');
    await expect(this.page.getByText('New Quotation')).toBeVisible();
  }

  async addMedicine(searchQuery: string, quantity: number = 1) {
    const productInput = this.page.getByPlaceholder('Search Medicine [F2]...').first();
    
    // Auto-wait for search response instead of timeout
    const searchResponsePromise = this.page.waitForResponse(response => 
      response.url().includes('/products/search/') && response.status() === 200
    );

    await productInput.fill(searchQuery);
    await searchResponsePromise;
    
    // Add small wait for frontend state update after response
    await this.page.waitForLoadState('domcontentloaded');

    await productInput.press('Enter');
    
    // It may skip straight to Qty (Strips) if there's only 1 valid batch, 
    // or it may show 'Select a Batch:' if there are multiple.
    const qtyLabel = this.page.getByText('Qty (Strips)', { exact: false }).first();
    const selectBatchLabel = this.page.getByText('Select a Batch:', { exact: true }).first();
    
    await qtyLabel.or(selectBatchLabel).waitFor({ state: 'visible', timeout: 5000 });
    
    if (await selectBatchLabel.isVisible()) {
      // The first batch button is auto-focused, so pressing Enter selects it
      await this.page.keyboard.press('Enter');
    }
    
    await expect(qtyLabel).toBeVisible();
    
    // The input is right after the label in the DOM or inside the same div.
    // Using a more robust locator for the input.
    const qtyInput = this.page.locator('input[type="number"]').first();
    await qtyInput.fill(quantity.toString());
    await qtyInput.press('Enter');

    await expect(this.page.getByTestId('cart-summary-items')).toContainText(`${quantity} Items`);
  }

  async collectPayment() {
    const saleRequestPromise = this.page.waitForRequest(request => 
        request.url().includes('/api/v1/sales/') && request.method() === 'POST'
    );
    const saleResponsePromise = this.page.waitForResponse(response => 
        response.url().includes('/api/v1/sales/') && response.status() === 201 && response.request().method() === 'POST'
    );

    await this.page.getByText('COLLECT PAYMENT').click();

    const request = await saleRequestPromise;
    const response = await saleResponsePromise;
    return { request, response };
  }

  async saveQuotation() {
    const reqPromise = this.page.waitForRequest(request => 
        request.url().includes('/api/v1/quotations/') && request.method() === 'POST'
    );
    const resPromise = this.page.waitForResponse(response => 
        response.url().includes('/api/v1/quotations/') && response.status() >= 200 && response.request().method() === 'POST'
    );

    await this.page.getByText('SAVE QUOTATION').click();

    const request = await reqPromise;
    const response = await resPromise;
    
    await expect(this.page.getByText('Successfully', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    return { request, response };
  }
}
