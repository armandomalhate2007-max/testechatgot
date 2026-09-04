import { test, expect } from '@playwright/test';

test('store opens and cart is reachable', async ({ page }) => {
  await page.goto(process.env.FRONTEND_URL || 'http://127.0.0.1:5500', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#store-title')).toBeVisible();
  await page.locator('#cart-count').click();
  await expect(page.locator('#cart-modal')).toBeVisible();
});

test('admin login reaches dashboard', async ({ page }) => {
  await page.goto(process.env.FRONTEND_URL || 'http://127.0.0.1:5500', { waitUntil: 'domcontentloaded' });
  await page.locator('#admin-page').waitFor({ state: 'attached' });
  await page.locator('#login-email').fill(process.env.ADMIN_EMAIL || 'e2e@atelier.test');
  await page.locator('#login-password').fill(process.env.ADMIN_PASSWORD || 'e2e-password-123');
  await page.locator('button', { hasText: 'Entrar' }).click();
  await expect(page.locator('#admin-page')).toHaveClass(/active/);
  await expect(page.locator('#admin-dashboard')).toBeVisible();
});
