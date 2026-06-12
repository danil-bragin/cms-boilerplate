import { expect, test } from '@playwright/test';

const EDITOR_EMAIL = 'editor@cms.local';
const EDITOR_PASSWORD = 'editor';

test('public page renders from the seed', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('h1')).toContainText('Build content sites that win on speed and SEO');
});

test('editor flow: login → create page → edit → publish → public', async ({ page }) => {
  const slug = `smoke-${Date.now()}`;

  // login through Keycloak
  await page.goto('/admin');
  await page.waitForURL(/realms\/cms/);
  await page.fill('#username', EDITOR_EMAIL);
  await page.fill('#password', EDITOR_PASSWORD);
  await page.click('#kc-login');
  await page.waitForURL(/\/admin\/pages/);
  await expect(page.getByText(EDITOR_EMAIL)).toBeVisible();

  // create a page via the dedicated New page route
  await page.getByRole('link', { name: 'New page' }).click();
  await page.waitForURL(/\/admin\/pages\/new/);
  await page.fill('input[placeholder="/about"]', `/${slug}`);
  await page.fill('input[placeholder="Page name"]', `Smoke ${slug}`);
  await page.click('button:has-text("Create page")');

  // create redirects straight into the Puck editor for the new page
  await page.waitForURL(/\/admin\/edit\//);

  // component drawer is populated from the shared puck config
  await expect(page.getByText('Heading', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // edit the root SEO title (full editor → autosave → publish chain, no flaky dnd)
  const pageTitle = `Smoke title ${slug}`;
  // the field renders both in the plugin rail and the right sidebar — take the visible one
  let titleField = page.locator('#root_text_title').filter({ visible: true });
  if ((await titleField.count()) === 0) {
    await page.getByRole('button', { name: 'Toggle right sidebar' }).click();
    titleField = page.locator('#root_text_title').filter({ visible: true });
  }
  await titleField.first().fill(pageTitle);

  // autosave fires after the debounce
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10_000 });

  // publish ("Publish" exact — "Unpublish" also contains the substring)
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('· published')).toBeVisible({ timeout: 10_000 });

  // public page serves the new content with the published SEO title.
  // the proxy's published-path set refreshes within 5s — poll through the window
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/en/${slug}`);
        return res.status();
      },
      { timeout: 10_000 },
    )
    .toBe(200);
  await page.goto(`/en/${slug}`);
  await expect(page).toHaveTitle(new RegExp(pageTitle));
});
