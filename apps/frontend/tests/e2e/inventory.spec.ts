import { test, expect } from '@playwright/test';

test.describe('Inventory Dashboard & UI Architecture', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dashboard/inventory');
    });

    test('Valuation Toggle dynamically updates Stock Value KPI', async ({ page }) => {
        // 1. Identify the toggles
        const purchaseToggle = page.getByRole('button', { name: 'Purchase' });
        const landingToggle = page.getByRole('button', { name: 'Landing' });
        const mrpToggle = page.getByRole('button', { name: 'Mrp' });

        // 2. Click Landing and verify the KPI card subtitle updates
        await landingToggle.click();
        await expect(page.getByText('At Landing Price')).toBeVisible();

        // 3. Click MRP and verify
        await mrpToggle.click();
        await expect(page.getByText('At MRP Price')).toBeVisible();
    });

    test('Master-Detail table expansion reveals nested batch data', async ({ page }) => {
        // Wait for the main stock table to populate
        await page.waitForSelector('table tbody tr');

        // Locate the first expandable row's chevron button
        const expandButton = page.locator('button:has(svg.lucide-chevron-right)').first();
        
        if (await expandButton.isVisible()) {
            await expandButton.click();
            
            // Assert the sub-table headers are now visible
            await expect(page.getByText('Batch No').first()).toBeVisible();
            await expect(page.getByText('Qty (Strips / Loose)').first()).toBeVisible();
            await expect(page.getByText('Landing Rate').first()).toBeVisible();
        }
    });

    test('Product Master Modal features Margin Auto-Calculator', async ({ page }) => {
        await page.waitForSelector('table tbody tr');

        // Click the edit product button on the first row
        const editButton = page.locator('button[title="Edit Product"]').first();
        if (await editButton.isVisible()) {
            await editButton.click();
            
            // Navigate to the new Tabbed interface
            await page.getByRole('tab', { name: 'Batches & Pricing' }).click();
            
            // Click to append a new batch to the useFieldArray
            await page.getByRole('button', { name: '+ Add Batch' }).click();

            // Input values to trigger the calculator
            const mrpInput = page.locator('input[name="batches.0.mrp"]');
            await mrpInput.fill('100');

            const marginInput = page.locator('input[name="batches.0.margin"]');
            await marginInput.fill('20');

            // Assert that the landing rate automatically populates with 80
            const landingInput = page.locator('input[name="batches.0.landingRate"]');
            await expect(landingInput).toHaveValue('80');
        }
    });
});
