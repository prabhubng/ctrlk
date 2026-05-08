import { test, expect, Page } from '@playwright/test';

const AG_GRID_URL = 'http://localhost:3456/demos/demo-inventory-aggrid.html';

test.describe('Demo 4A — AG Grid Inventory', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(AG_GRID_URL);
    await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });
  });

  // ─── PALETTE ────────────────────────────────

  test.describe('Command Palette', () => {

    test('Ctrl+K opens palette overlay', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const overlay = page.locator('.ctrlk-po.v, .pal-o.v, #palO.v');
      await expect(overlay).toBeVisible({ timeout: 2000 });
    });

    test('palette search filters commands', async ({ page }) => {
      await page.keyboard.press('Control+k');
      await page.locator('.ctrlk-pi, .pal-i, #palI').fill('density');
      const results = page.locator('.ctrlk-px, .pal-x');
      const count = await results.count();
      expect(count).toBeGreaterThan(0);
      // All results should contain "density"
      for (let i = 0; i < count; i++) {
        const text = await results.nth(i).textContent();
        expect(text?.toLowerCase()).toContain('densit');
      }
    });

    test('Escape closes palette', async ({ page }) => {
      await page.keyboard.press('Control+k');
      await page.keyboard.press('Escape');
      const palette = page.locator('.ctrlk-p.v, .pal-p.v, #palP.v');
      await expect(palette).not.toBeVisible({ timeout: 1000 });
    });

    test('palette overlay does NOT block page clicks when closed', async ({ page }) => {
      // This catches the pointer-events:none bug
      // The overlay exists in DOM but should not intercept clicks
      const toolbar = page.locator('.toolbar');
      await expect(toolbar).toBeVisible();

      const button = page.locator('.toolbar .btn').first();
      // If pointer-events bug exists, this click would be swallowed
      await button.click({ timeout: 2000 });
      // No error = click went through
    });
  });

  // ─── COLUMN SEARCH (Ctrl+G) ────────────────

  test.describe('Column Search', () => {

    test('Ctrl+G opens column search overlay', async ({ page }) => {
      await page.keyboard.press('Control+g');
      const searchOverlay = page.locator('#csO.v, .cs-o.v');
      await expect(searchOverlay).toBeVisible({ timeout: 2000 });
    });

    test('search finds columns by name', async ({ page }) => {
      await page.keyboard.press('Control+g');
      await page.locator('#csI').fill('supplier');
      const results = page.locator('.cs-i');
      const count = await results.count();
      expect(count).toBeGreaterThanOrEqual(1);
      const text = await results.first().textContent();
      expect(text?.toLowerCase()).toContain('supplier');
    });

    test('Enter jumps to column and highlights', async ({ page }) => {
      await page.keyboard.press('Control+g');
      await page.locator('#csI').fill('supplier');
      await page.keyboard.press('Enter');

      // Overlay should close
      const searchOverlay = page.locator('#csO.v, .cs-o.v');
      await expect(searchOverlay).not.toBeVisible({ timeout: 1000 });

      // Toast should show jump confirmation
      const toast = page.locator('#toast, .toast');
      await expect(toast).toContainText('Supplier', { timeout: 2000 });
    });

    test('column jump scrolls grid horizontally', async ({ page }) => {
      // Jump to a column that requires scrolling (far right)
      await page.keyboard.press('Control+g');
      await page.locator('#csI').fill('return');
      await page.keyboard.press('Enter');

      // Wait for scroll animation
      await page.waitForTimeout(500);

      // The Return % column header should now be visible
      const headerText = await page.locator('.ag-header-cell').allTextContents();
      const returnVisible = headerText.some(t => t.includes('Return'));
      expect(returnVisible).toBe(true);
    });
  });

  // ─── SAVED VIEWS ───────────────────────────

  test.describe('Saved Views', () => {

    test('save view opens prompt and adds to My Views', async ({ page }) => {
      // Clear any existing saved views
      await page.evaluate(() => localStorage.removeItem('ctrlk-demo4a-views'));
      await page.reload();
      await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });

      // Mock the prompt to return a name
      await page.evaluate(() => {
        window.prompt = () => 'Test View Alpha';
      });

      await page.locator('button:has-text("Save View")').click();

      // Toast should confirm save
      const toast = page.locator('#toast, .toast');
      await expect(toast).toContainText('Test View Alpha', { timeout: 2000 });
    });

    test('My Views dropdown shows saved views', async ({ page }) => {
      // Save a view first
      await page.evaluate(() => {
        window.prompt = () => 'Dropdown Test';
      });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Open My Views
      await page.locator('button:has-text("My Views")').click();
      const panel = page.locator('#myViewsPanel, .mv-panel');
      await expect(panel).toBeVisible({ timeout: 1000 });

      // Should contain the saved view
      await expect(panel).toContainText('Dropdown Test');
    });

    test('loading a saved view restores column visibility', async ({ page }) => {
      // Clear and reload
      await page.evaluate(() => localStorage.removeItem('ctrlk-demo4a-views'));
      await page.reload();
      await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });

      // Hide some columns via column chooser
      await page.locator('button:has-text("Columns")').click();
      await page.waitForTimeout(300);
      // Click "Essential Only" to hide most columns
      await page.locator('button:has-text("Essential Only")').click();
      await page.waitForTimeout(300);

      // Count visible columns
      const essentialCount = await page.locator('.ag-header-cell:visible').count();

      // Save this view
      await page.evaluate(() => { window.prompt = () => 'Essential View'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Show all columns
      await page.locator('button:has-text("Columns")').click();
      await page.locator('button:has-text("Show All")').click();
      await page.waitForTimeout(300);
      const allCount = await page.locator('.ag-header-cell:visible').count();
      expect(allCount).toBeGreaterThan(essentialCount);

      // Load the saved view via Ctrl+1
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(500);

      // Column count should match essential view
      const restoredCount = await page.locator('.ag-header-cell:visible').count();
      expect(restoredCount).toBe(essentialCount);
    });
  });

  // ─── SHARE VIEW ────────────────────────────

  test.describe('Share View', () => {

    test('Ctrl+Shift+S copies a share link', async ({ page }) => {
      // Grant clipboard permissions
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      await page.keyboard.press('Control+Shift+s');
      const toast = page.locator('#toast, .toast');
      await expect(toast).toContainText('copied', { timeout: 2000 });
    });

    test('shared URL restores view state', async ({ page }) => {
      // Hide some columns first
      await page.locator('button:has-text("Columns")').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Essential Only")').click();
      await page.waitForTimeout(500);

      // Get the share link
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.keyboard.press('Control+Shift+s');
      await page.waitForTimeout(500);
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());

      // Navigate to the share link — wait for full load
      await page.goto(clipboardText);
      await page.waitForSelector('.ag-root-wrapper', { timeout: 10000 });
      await page.waitForTimeout(2000);

      // Verify columns are in essential-only state (fewer than all)
      const headers = await page.locator('.ag-header-cell:visible').count();
      expect(headers).toBeLessThan(20); // Full set is 21+, essential is ~7
    });
  });

  // ─── DENSITY ───────────────────────────────

  test.describe('Density', () => {

    test('Ctrl+D cycles through density levels', async ({ page }) => {
      const toast = page.locator('#toast, .toast');

      await page.keyboard.press('Control+d');
      await expect(toast).toContainText(/compact|comfortable|spacious/, { timeout: 2000 });

      await page.keyboard.press('Control+d');
      await expect(toast).toContainText(/compact|comfortable|spacious/, { timeout: 2000 });
    });
  });

  // ─── COLUMN CHOOSER ───────────────────────

  test.describe('Column Chooser', () => {

    test('column chooser panel opens and shows all columns', async ({ page }) => {
      await page.locator('button:has-text("Columns")').click();
      const panel = page.locator('#ccPanel, .cc-panel');
      await expect(panel).toBeVisible({ timeout: 1000 });

      // Should show column count
      const count = page.locator('#ccCount, .cc-header-count');
      const text = await count.textContent();
      expect(text).toMatch(/\d+\s*\/\s*\d+/);
    });

    test('toggling columns changes grid visibility', async ({ page }) => {
      const initialHeaders = await page.locator('.ag-header-cell:visible').count();

      // Open column chooser
      await page.locator('button:has-text("Columns")').click();
      await page.waitForTimeout(300);
      
      // Click Essential Only (inside the open panel footer)
      await page.locator('.cc-footer button:has-text("Essential")').click();
      await page.waitForTimeout(500);

      const essentialHeaders = await page.locator('.ag-header-cell:visible').count();
      expect(essentialHeaders).toBeLessThan(initialHeaders);

      // Click Show All (panel is still open)
      await page.locator('.cc-footer button:has-text("Show All")').click();
      await page.waitForTimeout(500);

      const restoredHeaders = await page.locator('.ag-header-cell:visible').count();
      expect(restoredHeaders).toBe(initialHeaders);
    });

    test('search filters the column list', async ({ page }) => {
      await page.locator('button:has-text("Columns")').click();
      await page.locator('#ccSearch, .cc-search').fill('price');

      const items = page.locator('.cc-item');
      const count = await items.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10); // Should be filtered down
    });
  });

  // ─── TOOLBAR FILTERS ──────────────────────

  test.describe('Toolbar Filters', () => {

    test('Low Stock filter reduces row count', async ({ page }) => {
      const allCount = await page.locator('#rowCount').textContent();

      await page.locator('#vLow, button:has-text("Low Stock")').click();
      await page.waitForTimeout(500);

      const filteredCount = await page.locator('#rowCount').textContent();
      expect(Number(filteredCount)).toBeLessThan(Number(allCount));
    });
  });
});
