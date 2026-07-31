const fs = require('fs');
const file = 'tests/e2e/page-objects/BillingPage.ts';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  `  async selectCustomer(name: string) {
    const custInput = this.page.getByPlaceholder('Search Customer...').first();
    await custInput.fill(name);
    await custInput.blur();
  }`,
  `  async selectCustomer(name: string) {
    const custInput = this.page.getByPlaceholder('Search Customer...').first();
    await custInput.fill(name);
    await this.page.waitForTimeout(500);
    // press down arrow and enter to select the first option
    await this.page.keyboard.press('ArrowDown');
    await this.page.waitForTimeout(200);
    await this.page.keyboard.press('Enter');
  }`
);
fs.writeFileSync(file, code);
