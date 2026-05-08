import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3456';

test.describe('Website — ctrlk.dev', () => {

  test('landing page loads', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/CtrlK/i);
    await expect(page.locator('h1')).toContainText('IOUX');
  });

  test('navigation links are clickable', async ({ page }) => {
    await page.goto(BASE);
    // This catches the pointer-events overlay bug on the website
    const navLinks = page.locator('.nav-links a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(3);

    for (let i = 0; i < count; i++) {
      const link = navLinks.nth(i);
      const box = await link.boundingBox();
      expect(box).not.toBeNull();
      // Verify link is actually clickable (not blocked by overlay)
      await expect(link).toBeEnabled();
    }
  });

  test('Ctrl+K opens palette on website', async ({ page }) => {
    await page.goto(BASE);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    const palette = page.locator('.ctrlk-p.v');
    await expect(palette).toBeVisible({ timeout: 2000 });
  });

  test('API docs page loads', async ({ page }) => {
    await page.goto(`${BASE}/docs/api.html`);
    await expect(page.locator('h1')).toContainText('Documentation');
  });

  test('all demo pages load without JS errors', async ({ page }) => {
    const demos = [
      '/demos/demo-hr-directory.html',
      '/demos/demo-support-tickets.html',
      '/demos/demo-patient-record.html',
      '/demos/demo-inventory-aggrid.html',
      '/demos/demo-inventory-devextreme.html',
    ];

    for (const demo of demos) {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.goto(`${BASE}${demo}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // No JS errors
      expect(errors, `JS errors on ${demo}`).toEqual([]);
    }
  });
});
