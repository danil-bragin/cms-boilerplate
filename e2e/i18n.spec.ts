import { expect, test } from '@playwright/test';

test('admin nav switches to Russian via locale cookie', async ({ page, context }) => {
  // login
  await page.goto('/admin');
  await page.waitForURL(/realms\/cms/);
  await page.fill('#username', 'editor@cms.local');
  await page.fill('#password', 'editor');
  await page.click('#kc-login');
  await page.waitForURL(/\/admin/);
  await expect(page.getByRole('link', { name: 'Sites' })).toBeVisible();

  // set Russian locale and reload
  await context.addCookies([
    { name: 'admin_locale', value: 'ru', url: 'http://localhost:3000' },
  ]);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Сайты' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Авторы' })).toBeVisible();
});
