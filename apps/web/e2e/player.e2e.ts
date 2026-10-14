import { expect, test } from '@playwright/test';
import { notMono, numbersOn } from './numbers';

const DEMO = '/player/256939921';

test('the demo profile lists 20 matches, each with its result in words', async ({ page }) => {
  await page.goto(DEMO);
  const resultRows = page.getByRole('row').filter({ has: page.getByRole('cell', { name: /^(Win|Loss)$/ }) });
  await expect(resultRows).toHaveCount(20);
  await expect(page.getByText('Data from deadlock-api.com. Not affiliated with Valve.')).toBeVisible();
});

test('every number on the demo profile is set in a mono type style', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('region', { name: 'Recent matches' }).getByRole('row')).toHaveCount(21);
  const numbers = await numbersOn(page);
  expect(numbers.map((n) => n.text)).toContain('256939921');
  expect(numbers.filter(notMono)).toEqual([]);
});

test('the demo profile shows rank, record and top heroes, each rate with its sample', async ({ page }) => {
  await page.goto(DEMO);
  const rank = page.getByRole('region', { name: 'Rank' });
  await expect(rank).toContainText(/^Rank\w+ \d/);
  await expect(rank).toContainText(/After the ranked match of \d{4}-\d{2}-\d{2}/);
  const record = page.getByRole('region', { name: 'Record' });
  await expect(record).toContainText(/All [\d,]+ recorded normal-mode matches/);
  await expect(record.getByRole('definition').first()).toHaveText(/^\d+\.\d%$/);
  await expect(record).toContainText(/[\d,]+ wins, [\d,]+ losses/);
  const heroes = page.getByRole('region', { name: 'Top heroes' });
  await expect(heroes.getByRole('row')).toHaveCount(6);
  await expect(heroes.getByRole('columnheader', { name: 'Matches' })).toBeVisible();
});

// Asserts the page, not the status: loading.tsx streams the shell before notFound() runs, so the status may be 200.
for (const id of ['not-a-number', '4294967296', '01']) {
  test(`account id ${id} shows the not-found page`, async ({ page }) => {
    await page.goto(`/player/${id}`);
    await expect(page.getByRole('heading', { name: 'No such page' })).toBeVisible();
  });
}

test('an account with no normal-mode matches shows the empty state', async ({ page }) => {
  await page.goto('/player/1');
  await expect(page.getByText('No normal-mode matches recorded for this account yet.')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(0);
});

test('the mode tabs split the record, heroes and matches by ranked and unranked', async ({ page }) => {
  await page.goto(DEMO);
  const tabs = page.getByRole('navigation', { name: 'Match mode' });
  await expect(tabs.getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'page');
  const record = page.getByRole('region', { name: 'Record' });
  const total = Number((await record.textContent())?.match(/All ([\d,]+) recorded normal-mode matches/)?.[1]?.replace(/,/g, ''));

  const counts: number[] = [];
  for (const [label, scope] of [['Ranked', 'ranked'], ['Unranked', 'unranked']] as const) {
    await tabs.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`\\?mode=${scope}$`));
    await expect(tabs.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    const text = await record.textContent();
    const count = Number(text?.match(new RegExp(`All ([\\d,]+) recorded ${scope} matches`))?.[1]?.replace(/,/g, ''));
    expect(count).toBeGreaterThan(0);
    counts.push(count);
    const modes = page.getByRole('region', { name: 'Recent matches' }).getByRole('row').locator('td:nth-child(2)');
    await expect(modes).toHaveCount(Math.min(20, count));
    expect(new Set(await modes.allTextContents())).toEqual(new Set([label]));
  }
  expect(counts[0]! + counts[1]!).toBeLessThanOrEqual(total);
});

test('an unknown mode shows all matches', async ({ page }) => {
  await page.goto(`${DEMO}?mode=bogus`);
  await expect(page.getByRole('navigation', { name: 'Match mode' }).getByRole('link', { name: 'All' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: 'Record' })).toContainText(/recorded normal-mode matches/);
});
