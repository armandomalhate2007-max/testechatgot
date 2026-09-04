import { test, expect } from '@playwright/test';

test('API health is reachable', async ({ request }) => {
  const base = process.env.API_URL || 'http://127.0.0.1:3000';
  const response = await request.get(`${base}/api/health`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
});
