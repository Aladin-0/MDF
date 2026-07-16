import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFileAdmin = path.join(__dirname, '.auth/admin.json');
const authFileManager = path.join(__dirname, '.auth/manager.json');
const authFileBillingStaff = path.join(__dirname, '.auth/billing_staff.json');

async function loginUser(browser: any, phone: string, pin: string, authFile: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.fill('input[type="tel"], input[name="phone"]', phone);
  await page.fill('input[type="password"], input[name="password"]', pin);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  console.log("URL after login: ", page.url());
  // await page.waitForURL('**/dashboard**', { timeout: 10000 });
  await context.storageState({ path: authFile });
  await context.close();
}

setup('authenticate users', async ({ browser }) => {
  await loginUser(browser, '9421981370', 'password', authFileAdmin);    // Hiralal — Admin, full perms
  await loginUser(browser, '9876543210', '123456', authFileManager);    // Jadhav  — Manager, no revision perms
  await loginUser(browser, '9637298867', '123456', authFileBillingStaff); // Goswami — BillingStaff, minimal perms
});
