import { Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(phone: string, pin: string) {
    await this.page.fill('input[type="tel"], input[name="phone"]', phone);
    await this.page.fill('input[type="password"], input[name="password"]', pin);
    await this.page.click('button[type="submit"]');
    await this.page.waitForURL('**/dashboard**', { timeout: 10000 });
  }
}
