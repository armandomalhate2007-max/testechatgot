import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/server.ts', 'utf8');

test('server has real session helpers and pending-2FA distinction', () => {
  assert.match(src, /twoFactorPending/);
  assert.match(src, /function requireAuth/);
  assert.match(src, /function requireCsrf/);
  assert.match(src, /if \(session\.twoFactorPending !== pending\)/);
});

test('order price comes from database product price', () => {
  assert.match(src, /const unit=Number\(p\.price\)/);
  assert.doesNotMatch(src, /orderSchema.*price:/);
});

test('stock decrement is conditional inside transaction', () => {
  assert.match(src, /stock:\{gte:i\.quantity\}/);
  assert.match(src, /decrement:i\.quantity/);
  assert.match(src, /STOCK_CONFLICT/);
});


import { test } from 'node:test';
import assert from 'node:assert/strict';

test('v18 status transition claims the old status atomically', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(source, /updateMany\(\{\s*where:\{id:order\.id,status:order\.status\}/);
  assert.match(source, /STATUS_CONFLICT/);
});
