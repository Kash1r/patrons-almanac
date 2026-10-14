import { expect, test } from '@playwright/test';
import { notMono, numbersOn } from './numbers';

const DEMO_MATCH = '/match/116413049';

test('a profile row links to its match, which shows both scoreboards', async ({ page }) => {
  await page.goto('/player/256939921');
  const first = page.getByRole('region', { name: 'Recent matches' }).getByRole('link', { name: /^(Win|Loss)$/ }).first();
  const href = await first.getAttribute('href');
  expect(href).toMatch(/^\/match\/\d+$/);
  await first.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole('region', { name: 'Result' })).toContainText(/The (Amber Hand|Sapphire Flame) won/);
  for (const team of ['The Amber Hand', 'The Sapphire Flame']) {
    await expect(page.getByRole('region', { name: team }).getByRole('row')).toHaveCount(7);
  }
});

test('the demo match draws both curves, item timelines, and sets every number in mono', async ({ page }) => {
  await page.goto(DEMO_MATCH);
  await expect(page.getByRole('img', { name: /^Souls\./ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Damage to heroes\./ })).toBeVisible();
  const items = page.getByRole('region', { name: 'Item timelines' });
  await expect(items.getByRole('listitem').filter({ hasText: /bought at \d+:\d{2}/ }).first()).toBeAttached();
  const numbers = await numbersOn(page);
  expect(numbers.map((n) => n.text)).toContain('116413049');
  expect(numbers.filter(notMono)).toEqual([]);
});

test('the crosshair reads both teams at a sample', async ({ page }) => {
  await page.goto(DEMO_MATCH);
  const souls = page.getByRole('img', { name: /^Souls\./ });
  await souls.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status').first()).toContainText(/The Amber Hand[\s\S]*The Sapphire Flame/);
});

test('on a phone the scoreboard shows one team per tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(DEMO_MATCH);
  const scoreboards = page.getByRole('region', { name: 'Scoreboards' });
  await expect(scoreboards.getByRole('region', { name: 'The Amber Hand' })).toBeVisible();
  await expect(scoreboards.getByRole('region', { name: 'The Sapphire Flame' })).toBeHidden();
  await scoreboards.getByRole('tab', { name: 'The Sapphire Flame' }).click();
  await expect(scoreboards.getByRole('region', { name: 'The Sapphire Flame' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
});

test('an unknown match shows the empty state', async ({ page }) => {
  await page.goto('/match/999999999');
  await expect(page.getByRole('heading', { name: 'No record of this match' })).toBeVisible();
});

for (const id of ['abc', '0', '01']) {
  test(`match id ${id} shows the not-found page`, async ({ page }) => {
    await page.goto(`/match/${id}`);
    await expect(page.getByRole('heading', { name: 'No such page' })).toBeVisible();
  });
}
