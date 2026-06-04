import { test, expect } from '@playwright/test';

/**
 * Browser E2E for the runtime i18n + per-jurisdiction configuration. Runs
 * against the offline demo store (no backend). Verifies that switching the
 * locale in the shell header re-labels the navigation at runtime (no reload),
 * that the choice persists across a reload, and that switching the jurisdiction
 * updates the compliance-register framing hint.
 */
async function enterOfflineDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /offline demo mode/i }).click();
  await expect(page.getByRole('navigation', { name: /primary/i }).first()).toBeVisible();
}

/** The two header selects (language, then jurisdiction) live in the locale switcher. */
function localeSelect(page: import('@playwright/test').Page) {
  return page.locator('app-locale-switcher select').first();
}
function jurisdictionSelect(page: import('@playwright/test').Page) {
  return page.locator('app-locale-switcher select').nth(1);
}

test.describe('i18n + jurisdiction', () => {
  test('navigation renders in English by default', async ({ page }) => {
    await enterOfflineDemo(page);
    await expect(page.getByRole('link', { name: 'Registers' }).first()).toBeVisible();
  });

  test('switching the locale re-labels the navigation at runtime', async ({ page }) => {
    await enterOfflineDemo(page);
    await expect(page.getByRole('link', { name: 'Registers' }).first()).toBeVisible();

    await localeSelect(page).selectOption('fr');

    // French catalog: "Registers" -> "Registres", "Findings" -> "Constats".
    await expect(page.getByRole('link', { name: 'Registres' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Constats' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Registers' })).toHaveCount(0);
  });

  test('the chosen locale persists across a reload', async ({ page }) => {
    await enterOfflineDemo(page);
    await localeSelect(page).selectOption('fr');
    await expect(page.getByRole('link', { name: 'Registres' }).first()).toBeVisible();

    await page.reload();

    await expect(localeSelect(page)).toHaveValue('fr');
    await expect(page.getByRole('link', { name: 'Registres' }).first()).toBeVisible();
  });

  test('switching the jurisdiction updates the compliance framing hint', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers#compliance');

    const hint = page.locator('.jurisdiction-hint');
    await expect(hint).toBeVisible();
    const ukFraming = (await hint.textContent())?.trim() ?? '';
    expect(ukFraming.length).toBeGreaterThan(0);

    // UK is the default; switching to the US must change the framing text.
    await jurisdictionSelect(page).selectOption('US');
    await expect
      .poll(async () => (await hint.textContent())?.trim() ?? '')
      .not.toBe(ukFraming);
  });
});
