import { expect, test } from '@playwright/test';
import { notMono, numbersOn } from './numbers';

test('the header links to the leaderboard, which opens on North America', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Leaderboard' }).click();
  await expect(page).toHaveURL(/\/leaderboard$/);
  await expect(page.getByRole('link', { name: 'North America' })).toHaveAttribute('aria-current', 'page');
  const standings = page.getByRole('region', { name: 'North America standings' });
  await expect(standings.getByRole('row')).toHaveCount(101);
  await expect(standings.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('1');
});

test('every region loads, and places are set in mono', async ({ page }) => {
  for (const [region, name] of [['Europe', 'Europe'], ['Asia', 'Asia'], ['SAmerica', 'South America'], ['Oceania', 'Oceania']]) {
    await page.goto(`/leaderboard?region=${region}`);
    await expect(page.getByRole('region', { name: `${name} standings` }).getByRole('row').nth(1)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${region} scrolls sideways`).toBe(0);
  }
  // Steam names are text even when they hold digits ("Cac2510 TTV"), so they are left out.
  const numbers = await numbersOn(page, '[data-steam-name]');
  expect(numbers.length).toBeGreaterThan(50);
  expect(numbers.filter(notMono)).toEqual([]);
});

test('the pager moves through the standings', async ({ page }) => {
  await page.goto('/leaderboard?region=Europe');
  await page.getByRole('link', { name: 'Next 100' }).click();
  await expect(page).toHaveURL(/region=Europe&page=2$/);
  const standings = page.getByRole('region', { name: 'Europe standings' });
  await expect(standings).toContainText('Places 101 to 200');
  await expect(page.getByRole('link', { name: 'Previous 100' })).toBeVisible();
});

test('a single-account player links to their profile', async ({ page }) => {
  await page.goto('/leaderboard?region=Europe');
  const link = page.getByRole('region', { name: 'Europe standings' }).getByRole('link').filter({ hasNotText: /^(Next|Previous)/ }).first();
  await expect(link).toHaveAttribute('href', /^\/player\/\d+$/);
});

test('an unknown region falls back to North America', async ({ page }) => {
  await page.goto('/leaderboard?region=Mars&page=abc');
  await expect(page.getByRole('region', { name: 'North America standings' })).toContainText('Places 1 to 100');
});
