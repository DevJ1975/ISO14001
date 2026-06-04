import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Browser E2E for the ISO 14001 environmental registers. Runs against the
 * offline demo store (no backend), exercising the three environmental register
 * tabs added for ISO 14001:2015 — aspects/impacts (6.1.2), compliance
 * obligations (6.1.3) and objectives & targets (6.2) — plus deep-linking,
 * adding a row, CSV export and an axe accessibility scan.
 *
 * Note: creating a new audit with "ISO 14001:2015" as criteria is restricted to
 * lead auditors / tenant admins (a backend sign-in), so that path is covered by
 * the unit suite (standard-checklist / audit-guide / field-routes). The
 * environmental register tabs themselves are always available, so they are what
 * this offline browser journey verifies.
 */
async function enterOfflineDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /offline demo mode/i }).click();
  await expect(page.getByRole('navigation', { name: /primary/i }).first()).toBeVisible();
}

test.describe('ISO 14001 environmental registers', () => {
  test('shows the three environmental register tabs', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers');
    for (const label of [/Env\. aspects \(14001\)/i, /Compliance obligations \(14001\)/i, /Env\. objectives \(14001\)/i]) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('deep-links open the matching environmental tab', async ({ page }) => {
    await enterOfflineDemo(page);

    await page.goto('/registers#envAspects');
    await expect(page.getByRole('button', { name: /Env\. aspects \(14001\)/i })).toHaveClass(/on/);
    await expect(page.getByRole('heading', { name: /Environmental aspects & impacts/i })).toBeVisible();

    await page.goto('/registers#envObligations');
    await expect(page.getByRole('button', { name: /Compliance obligations \(14001\)/i })).toHaveClass(/on/);

    await page.goto('/registers#envObjectives');
    await expect(page.getByRole('button', { name: /Env\. objectives \(14001\)/i })).toHaveClass(/on/);
  });

  test('adding an environmental aspect renders an editable row', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers#envAspects');
    await expect(page.getByRole('button', { name: /Env\. aspects \(14001\)/i })).toHaveClass(/on/);

    const rows = page.locator('.reg .row');
    const before = await rows.count();
    await page.getByRole('button', { name: /^Add$/ }).click();
    await expect(rows).toHaveCount(before + 1);

    // The new row exposes the aspect fields (activity / aspect / impact).
    await expect(page.getByPlaceholder(/Solvent degreasing/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/VOC emissions to air/i).first()).toBeVisible();
  });

  test('environmental register exposes CSV export', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers#envObligations');
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
  });

  test('has no serious accessibility violations on an environmental register tab', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers#envAspects');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
