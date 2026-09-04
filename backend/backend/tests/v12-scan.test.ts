import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v12 backend has paginated admin resources and product restore', async () => {
  const s = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(s, /admin\/products.*pageSize/);
  assert.match(s, /orders.*pageSize/);
  assert.match(s, /products\/:id\/restore/);
  assert.match(s, /prisma\.product\.count/);
  assert.match(s, /prisma\.order\.count/);
});

test('v12 frontend exposes admin search and pagination controls', async () => {
  const html = await readFile(new URL('../../../frontend/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../../../frontend/js/app.js', import.meta.url), 'utf8');
  assert.match(html, /product-search/);
  assert.match(html, /order-search/);
  assert.match(html, /Anterior/);
  assert.match(html, /Seguinte/);
  assert.match(js, /restoreProduct/);
  assert.match(js, /adminProductPage/);
  assert.match(js, /adminOrderPage/);
});
