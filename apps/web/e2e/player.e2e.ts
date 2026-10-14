import { expect, test } from '@playwright/test';

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
  const numbers = await page.evaluate(() => {
    const MONO_STYLES = ['type-label', 'type-stat-xl', 'type-stat', 'type-table'];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: { text: string; mono: boolean; family: string }[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = node.textContent?.trim() ?? '';
      if (parent === null || ['SCRIPT', 'STYLE'].includes(parent.tagName) || !/\d/.test(text)) continue;
      const styled = parent.closest('[class*="type-"]');
      found.push({
        text,
        mono: styled !== null && MONO_STYLES.some((style) => styled.classList.contains(style)),
        family: getComputedStyle(parent).fontFamily,
      });
    }
    return found;
  });
  expect(numbers.map((n) => n.text)).toContain('256939921');
  expect(numbers.filter((n) => !n.mono || !n.family.includes('IBM Plex Mono'))).toEqual([]);
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
