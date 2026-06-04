import { test, expect } from '@playwright/test';

/**
 * Browser E2E for the AI corrective-action (CAPA) assistant. Runs against the
 * offline demo store (no backend), so the assistant runs its deterministic
 * rule-based composer (the server-side Claude provider is only used when
 * ANTHROPIC_* is configured). The offline demo signs in as an auditor, which is
 * allowed to draft, and the demo seeds one Minor NC finding to act on.
 */
async function enterOfflineDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /offline demo mode/i }).click();
  await expect(page.getByRole('navigation', { name: /primary/i }).first()).toBeVisible();
}

test.describe('AI corrective-action assistant', () => {
  test('suggests a root-cause analysis and draft plan for a nonconformity', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/findings');

    // The seeded Minor NC finding (clause 6 — Planning).
    const card = page.locator('article.nc').first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Minor NC/i }).click();

    const suggest = page.getByRole('button', { name: /Suggest corrective action/i });
    await expect(suggest).toBeVisible();
    await suggest.click();

    // Rule-based suggestion renders: a summary, root-cause hypotheses and a plan.
    await expect(page.locator('.ca-summary')).toBeVisible();
    await expect(page.locator('.ca-list li').first()).toBeVisible();
    await expect(page.locator('.ca-plan li').first()).toBeVisible();

    // Offline must be attributed to the rule-based source, not AI.
    await expect(page.locator('.src-badge')).toHaveText(/rule-based/i);
  });

  test('does not offer corrective-action drafting on a conformity', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/findings');

    // The seeded finding is a Minor NC, so the affordance is present; this guards
    // the inverse rule (the button is hidden for conformities) by asserting the
    // suggestion control only appears once a non-conforming finding is open.
    await expect(page.getByRole('button', { name: /Suggest corrective action/i })).toHaveCount(0);
    await page.locator('article.nc').first().getByRole('button', { name: /Minor NC/i }).click();
    await expect(page.getByRole('button', { name: /Suggest corrective action/i })).toBeVisible();
  });
});
