import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const frontend = path.resolve(process.cwd(), '../../frontend/index.html');

test('frontend smoke: store and admin entry points render', async ({ page }) => {
  await page.goto(pathToFileURL(frontend).href);
  await expect(page.locator('#store-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin' })).toBeVisible();
  await page.getByRole('button', { name: 'Admin' }).click();
  await expect(page.locator('#login-page')).toBeVisible();
  await expect(page.locator('#login-email')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#login-password')).toHaveAttribute('autocomplete', 'current-password');
});

test('frontend smoke: cart can be opened without crashing', async ({ page }) => {
  await page.goto(pathToFileURL(frontend).href);
  await page.getByRole('button', { name: /Carrinho/ }).click();
  await expect(page.locator('#cart-modal')).toBeVisible();
});
