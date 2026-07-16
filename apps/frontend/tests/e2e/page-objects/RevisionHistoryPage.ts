import { Page, expect } from '@playwright/test';

export class RevisionHistoryPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async verifyRevisionCount(expectedCount: number) {
    // Note: Assuming there's a table or list of revisions
    const rows = this.page.locator('tbody tr'); // update selector based on actual UI
    await expect(rows).toHaveCount(expectedCount);
  }

  async verifyRevisionExists(action: string, userName: string) {
    const row = this.page.locator('tbody tr', { hasText: action }).filter({ hasText: userName }).first();
    await expect(row).toBeVisible();
  }

  async verifyEmptyState() {
    await expect(this.page.getByText('No revision history found')).toBeVisible(); // adjust text as needed
  }
}
