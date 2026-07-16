import { test as base, Page } from '@playwright/test';
import { ApiHelper } from './api-helpers';
import { LoginPage } from '../page-objects/LoginPage';
import { BillingPage } from '../page-objects/BillingPage';

type TestFixtures = {
  api: ApiHelper;
  loginPage: LoginPage;
  billingPage: BillingPage;
};

export const test = base.extend<TestFixtures>({
  api: async ({ request }, use) => {
    // API Request context with auth cookie if available
    const apiHelper = new ApiHelper(request);
    await use(apiHelper);
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  billingPage: async ({ page }, use) => {
    await use(new BillingPage(page));
  },
});

export { expect } from '@playwright/test';
