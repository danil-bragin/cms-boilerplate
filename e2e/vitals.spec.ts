import { expect, test } from '@playwright/test';

test('public page emits a web-vitals beacon', async ({ page }) => {
  // sendBeacon bodies (Blob) are not readable from Playwright — asserting the
  // POST itself fired is the contract; payload shape is covered by the API 204/400 tests
  const beacon = page.waitForRequest(
    (req) => req.url().includes('/api/vitals') && req.method() === 'POST',
    { timeout: 20_000 },
  );
  await page.goto('/en');
  await page.mouse.click(10, 10);
  await page.waitForTimeout(500);
  await page.goto('/en/about'); // real navigation → pagehide → flush
  const req = await beacon;
  expect(req.url()).toContain('/api/vitals');
});
