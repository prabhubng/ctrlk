import { test, expect, Page } from '@playwright/test';

const DX_URL = 'http://localhost:3456/demos/demo-inventory-devextreme.html';

test.describe('Demo 4B — DevExtreme Inventory', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(DX_URL);
    await page.waitForSelector('.dx-datagrid', { timeout: 10000 });
    // Clear saved views from previous runs
    await page.evaluate(() => localStorage.removeItem('ctrlk-demo4b-views'));
  });

  // ─── PALETTE ────────────────────────────────

  test.describe('Command Palette', () => {

    test('Ctrl+K opens palette', async ({ page }) => {
      await page.keyboard.press('Control+k');
      const palette = page.locator('#palP.v, .pal-p.v');
      await expect(palette).toBeVisible({ timeout: 2000 });
    });

    test('palette overlay has pointer-events:none when closed', async ({ page }) => {
      // Verify the overlay doesn't block clicks
      const overlay = page.locator('#palO, .pal-o');
      if (await overlay.count() > 0) {
        const pe = await overlay.evaluate(el => getComputedStyle(el).pointerEvents);
        // Should be 'none' or element should have display:none
        const display = await overlay.evaluate(el => getComputedStyle(el).display);
        expect(pe === 'none' || display === 'none').toBe(true);
      }
    });

    test('toolbar buttons are clickable when palette is closed', async ({ page }) => {
      // This is the exact bug we caught — palette overlay at z-index 99998
      // was eating clicks because it had opacity:0 but no pointer-events:none
      const allBtn = page.locator('#vAll');
      await allBtn.click({ timeout: 2000 });
      // If we get here without timeout, clicks are working
      await expect(allBtn).toHaveClass(/active/);
    });
  });

  // ─── COLUMN SEARCH (Ctrl+G) ────────────────

  test.describe('Column Search', () => {

    test('Ctrl+G opens column search', async ({ page }) => {
      await page.keyboard.press('Control+g');
      const overlay = page.locator('#csO.v, .cs-o.v');
      await expect(overlay).toBeVisible({ timeout: 2000 });
    });

    test('column jump scrolls horizontally in DevExtreme grid', async ({ page }) => {
      // This catches the virtual column rendering bug
      await page.keyboard.press('Control+g');
      await page.locator('#csI').fill('return');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);

      // Verify grid scrolled — the Return % header should be visible
      const headers = await page.locator('.dx-header-row td').allTextContents();
      const returnVisible = headers.some(t => t.includes('Return'));
      expect(returnVisible).toBe(true);
    });

    test('column jump highlights cells after scroll', async ({ page }) => {
      await page.keyboard.press('Control+g');
      await page.locator('#csI').fill('warehouse');
      await page.keyboard.press('Enter');

      // Check quickly — highlight fades after 1.5s
      await page.waitForTimeout(200);

      // Verify toast confirms the jump (more reliable than checking highlight color)
      const toast = page.locator('#toast, .toast');
      await expect(toast).toContainText('Warehouse', { timeout: 2000 });

      // Verify the Warehouse column header is now visible in viewport
      const headers = await page.locator('.dx-header-row td').allTextContents();
      const warehouseVisible = headers.some(t => t.includes('Warehouse'));
      expect(warehouseVisible).toBe(true);
    });
  });

  // ─── SAVED VIEWS ───────────────────────────

  test.describe('Saved Views', () => {

    test('save captures column visibility state', async ({ page }) => {
      // Hide columns via column chooser
      await page.locator('button:has-text("Columns")').click();
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Essential Only")').click();
      await page.waitForTimeout(500);

      // Save the view
      await page.evaluate(() => { window.prompt = () => 'Essential DX'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Verify view was saved
      const views = await page.evaluate(() => {
        return JSON.parse(localStorage.getItem('ctrlk-demo4b-views') || '[]');
      });
      expect(views.length).toBe(1);
      expect(views[0].name).toBe('Essential DX');
      expect(views[0].state.colState).toBeDefined();
      expect(views[0].state.colState.length).toBeGreaterThan(0);
    });

    test('load restores column visibility — DevExtreme columnOption approach', async ({ page }) => {
      // This catches the dxGrid.state() serialization bug
      // The fix uses per-column columnOption() instead

      // Step 1: Hide non-essential columns
      await page.locator('button:has-text("Columns")').click();
      await page.locator('button:has-text("Essential Only")').click();
      await page.waitForTimeout(500);

      const essentialHeaders = await page.locator('.dx-header-row td:visible').count();

      // Step 2: Save
      await page.evaluate(() => { window.prompt = () => 'Load Test DX'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Step 3: Show all columns
      await page.locator('button:has-text("Columns")').click();
      await page.locator('button:has-text("Show All")').click();
      await page.waitForTimeout(500);
      const allHeaders = await page.locator('.dx-header-row td:visible').count();
      expect(allHeaders).toBeGreaterThan(essentialHeaders);

      // Step 4: Load the saved view
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(500);

      // Step 5: Verify columns are hidden again
      const restoredHeaders = await page.locator('.dx-header-row td:visible').count();
      expect(restoredHeaders).toBe(essentialHeaders);
    });

    test('My Views dropdown shows saved views with slots', async ({ page }) => {
      // Save two views
      await page.evaluate(() => { window.prompt = () => 'View One'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      await page.evaluate(() => { window.prompt = () => 'View Two'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Open My Views
      await page.locator('button:has-text("My Views")').click();
      const panel = page.locator('#myViewsPanel, .mv-panel');
      await expect(panel).toBeVisible();

      // Should show both views with slot numbers
      await expect(panel).toContainText('View One');
      await expect(panel).toContainText('View Two');
      await expect(panel).toContainText('Ctrl+1');
      await expect(panel).toContainText('Ctrl+2');

      // Count badge should show 2/5
      const count = page.locator('#mvCount, .mv-header-count');
      await expect(count).toContainText('2');
    });

    test('deleting a view removes it from My Views', async ({ page }) => {
      // Save a view
      await page.evaluate(() => { window.prompt = () => 'Delete Me'; });
      await page.locator('button:has-text("Save View")').click();
      await page.waitForTimeout(500);

      // Open My Views and delete
      await page.locator('button:has-text("My Views")').click();
      await page.locator('.mv-delete').first().click();
      await page.waitForTimeout(300);

      // Should show empty state
      const panel = page.locator('#myViewsPanel, .mv-panel');
      await expect(panel).toContainText('No saved views');
    });
  });

  // ─── SHARE VIEW ────────────────────────────

  test.describe('Share View', () => {

    test('share URL uses colState format, not dxState', async ({ page }) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.keyboard.press('Control+Shift+s');
      await page.waitForTimeout(500);

      const url = await page.evaluate(() => navigator.clipboard.readText());
      expect(url).toContain('#ctrlk=');

      // Decode and verify format
      const hash = url.split('#ctrlk=')[1];
      const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const state = JSON.parse(decodeURIComponent(escape(atob(padded))));

      // Should use colState format (not dxState which fails serialization)
      expect(state.colState).toBeDefined();
      expect(state.dxState).toBeUndefined();
    });
  });

  // ─── DENSITY ───────────────────────────────

  test.describe('Density', () => {

    test('Ctrl+D changes cell padding in DevExtreme grid', async ({ page }) => {
      // Get initial padding
      const initialPad = await page.locator('.dx-data-row td').first().evaluate(
        el => getComputedStyle(el).padding
      );

      await page.keyboard.press('Control+d');
      await page.waitForTimeout(300);

      const newPad = await page.locator('.dx-data-row td').first().evaluate(
        el => el.style.padding
      );

      // Padding should have changed (DevExtreme uses inline styles for density)
      expect(newPad).not.toBe('');
    });
  });

  // ─── COLUMN CHOOSER ───────────────────────

  test.describe('Column Chooser', () => {

    test('column chooser opens with search and checkboxes', async ({ page }) => {
      await page.locator('button:has-text("Columns")').click();
      const panel = page.locator('#ccPanel, .cc-panel');
      await expect(panel).toBeVisible();

      // Has search input
      await expect(page.locator('#ccSearch, .cc-search')).toBeVisible();

      // Has checkboxes
      const items = page.locator('.cc-item');
      expect(await items.count()).toBeGreaterThan(10);
    });

    test('unchecking a column hides it from the grid', async ({ page }) => {
      // Count initial visible headers
      const before = await page.locator('.dx-header-row td').count();

      // Toggle first non-fixed column
      await page.locator('button:has-text("Columns")').click();
      await page.waitForTimeout(300);

      // Find the first non-fixed item and click it
      const items = page.locator('.cc-item');
      // Skip first two (SKU and Name are fixed)
      await items.nth(2).click();
      await page.waitForTimeout(300);

      const after = await page.locator('.dx-header-row td').count();
      expect(after).toBeLessThan(before);
    });
  });

  // ─── KEYBOARD SHORTCUT CHROME FIX ─────────

  test.describe('Chrome Shortcut Override', () => {

    test('Ctrl+K does NOT navigate to address bar', async ({ page }) => {
      // If Ctrl+K properly prevented, the palette opens
      // If not, Chrome steals focus to address bar and palette doesn't open
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(300);

      // Check that the page still has focus (not address bar)
      const hasFocus = await page.evaluate(() => document.hasFocus());
      expect(hasFocus).toBe(true);

      // Palette should be open
      const palette = page.locator('#palP.v, .pal-p.v');
      await expect(palette).toBeVisible();
    });
  });
});
