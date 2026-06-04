import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SHOTS = '/tmp/p0-shots';

async function enterOfflineDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: /offline demo mode/i }).click();
  await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible();
}

test.describe('P0 verification', () => {
  test('fieldwork shows the full ISO 45001 clause checklist', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/fieldwork');
    const progress = page.locator('.progress small');
    await expect(progress).toBeVisible();
    const text = (await progress.textContent())?.trim() ?? '';
    const total = Number(text.match(/\/\s*(\d+)/)?.[1] ?? '0');
    const firstClause = (await page.locator('.fw-top .clause').textContent())?.trim();
    const section = (await page.locator('.fw-top .section').textContent())?.trim();
    // eslint-disable-next-line no-console
    console.log(`PROGRESS="${text}" TOTAL=${total} FIRST="${firstClause}" SECTION="${section}"`);
    await page.screenshot({ path: `${SHOTS}/01-fieldwork.png`, fullPage: true });
    expect(total).toBeGreaterThanOrEqual(30);
  });

  test('registers deep-links open the matching tab', async ({ page }) => {
    await enterOfflineDemo(page);

    await page.goto('/registers#permits');
    const permits = page.getByRole('button', { name: /Permits/i });
    await expect(permits).toHaveClass(/on/);
    await page.screenshot({ path: `${SHOTS}/02-registers-permits.png` });

    await page.goto('/registers#incidents');
    const incidents = page.getByRole('button', { name: /Incidents/i });
    await expect(incidents).toHaveClass(/on/);
    await page.screenshot({ path: `${SHOTS}/03-registers-incidents.png` });
  });

  test('guide deep-link scrolls to the clause and search filters', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/guide#clause-6.1.2');
    const target = page.locator('#clause-6\\.1\\.2');
    await expect(target).toBeInViewport({ ratio: 0.05 });
    await page.screenshot({ path: `${SHOTS}/04-guide-clause.png` });

    const before = await page.locator('article#clauses .clause').count();
    await page.getByPlaceholder(/Filter clauses/i).fill('incident');
    await expect.poll(async () => page.locator('article#clauses .clause').count()).toBeLessThan(before);
    const after = await page.locator('article#clauses .clause').count();
    // eslint-disable-next-line no-console
    console.log(`GUIDE clauses before=${before} after-filter=${after}`);
    await page.screenshot({ path: `${SHOTS}/05-guide-search.png` });
  });

  test('deleting a document attachment asks for confirmation', async ({ page }) => {
    await enterOfflineDemo(page);
    await page.goto('/registers#documents');
    await expect(page.getByRole('button', { name: /Documents/i })).toHaveClass(/on/);

    // Seeded documents have no attachment yet — add one so a remove control exists.
    const tmp = path.join(os.tmpdir(), 'p0-evidence.txt');
    fs.writeFileSync(tmp, 'verification evidence');
    await page.locator('input[type=file]').first().setInputFiles(tmp);

    const remove = page.getByRole('button', { name: /Remove attachment/i }).first();
    await expect(remove).toBeVisible();
    await remove.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Remove attachment\?/i);
    await page.screenshot({ path: `${SHOTS}/06-confirm-dialog.png` });

    // Cancel must keep the attachment (the safety net).
    await dialog.getByRole('button', { name: /Cancel/i }).click();
    await expect(dialog).toBeHidden();
    await expect(remove).toBeVisible();

    // Confirming removes it.
    await remove.click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^Remove$/i }).click();
    await expect(page.getByRole('button', { name: /Remove attachment/i })).toHaveCount(0);
  });
});
