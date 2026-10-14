import { expect, test } from '@playwright/test';

test('searching a name from the home page lists the profile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: /Player name/ }).fill('Kashir');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/\?q=Kashir$/);
  const results = page.getByRole('region', { name: 'Players' });
  await expect(results).toContainText(/\d+ closest Steam names for “Kashir”/);
  await results.getByRole('link', { name: /Account 256939921/ }).click();
  await expect(page).toHaveURL(/\/player\/256939921$/);
});

for (const query of ['256939921', '76561198217205649', 'https://steamcommunity.com/profiles/76561198217205649/']) {
  test(`${query} offers the account directly`, async ({ page }) => {
    await page.goto(`/?q=${encodeURIComponent(query)}`);
    await expect(page.getByRole('link', { name: 'Open account 256939921' })).toHaveAttribute('href', '/player/256939921');
  });
}

test('a query nobody matches shows the empty state', async ({ page }) => {
  await page.goto('/?q=zzzzqqqxx');
  await expect(page.getByRole('region', { name: 'Players' })).toContainText('No players found for “zzzzqqqxx”.');
});

test('a blank query shows the demo link instead of results', async ({ page }) => {
  await page.goto('/?q=%20%20');
  await expect(page.getByRole('link', { name: 'View the demo profile' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Players' })).toHaveCount(0);
});
