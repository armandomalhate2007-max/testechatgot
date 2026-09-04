import { test, expect } from '@playwright/test';

test('admin can create a product and store exposes it', async ({ page }) => {
  const base = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Admin' }).click();
  await page.locator('#login-email').fill(process.env.ADMIN_EMAIL || 'e2e@atelier.test');
  await page.locator('#login-password').fill(process.env.ADMIN_PASSWORD || 'e2e-password-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('#admin-page')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Produtos' }).click();
  await page.getByRole('button', { name: 'Novo produto' }).click();
  await page.locator('#prod-name').fill('E2E Produto');
  await page.locator('#prod-ref').fill(`E2E-${Date.now()}`);
  await page.locator('#prod-price').fill('125');
  await page.locator('#stock-M').fill('3');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#admin-products')).toContainText('E2E Produto');
});
