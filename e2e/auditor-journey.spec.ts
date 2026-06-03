import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Browser E2E for the auditor journey. Works against the offline demo store, so
 * it does not require a backend — it exercises the real Angular app end to end:
 * sign-in (offline), navigation, the OH&S registers (incl. the clause-4–10
 * governance registers), and the report screen, plus an axe accessibility scan.
 */
test.describe('ISO 45001 auditor app', () => {
  test('signs in (offline) and reaches the workspace', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /offline demo mode/i }).click();
    await expect(page).toHaveURL(/\/$|\/$/);
    await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible();
  });

  test('shows all OH&S registers including the governance tabs', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /offline demo mode/i }).click();
    await page.goto('/registers');
    for (const label of ['Risks/opps', 'Objectives', 'Resources', 'Competence', 'Awareness', 'Mgmt review']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') })).toBeVisible();
    }
    // Adding a management-review row should render an editable card.
    await page.getByRole('button', { name: /Mgmt review/i }).click();
    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(page.locator('.reg .row').first()).toBeVisible();
  });

  test('report screen exposes the print action and report details', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /offline demo mode/i }).click();
    await page.goto('/report');
    await expect(page.getByRole('link', { name: /Generate PDF/i })).toBeVisible();
  });

  test('has no serious accessibility violations on the registers screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /offline demo mode/i }).click();
    await page.goto('/registers');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
