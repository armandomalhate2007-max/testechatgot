import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../../../frontend/js/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../../frontend/index.html', import.meta.url), 'utf8');

test('v10 exposes audit and password security routes', () => {
  assert.match(server, /\/api\/audit/);
  assert.match(server, /\/api\/auth\/password\/change/);
  assert.match(server, /argon2\.hash\(parsed\.data\.newPassword/);
});

test('v10 admin has security and audit surfaces', () => {
  assert.match(html, /admin-security/);
  assert.match(html, /admin-audit/);
  assert.match(frontend, /uploadImage\(file\)/);
  assert.match(frontend, /changePassword\(\)/);
  assert.match(frontend, /loadAudit\(\)/);
});

test('orders tab uses a unique content id', () => {
  assert.doesNotMatch(html, /id="admin-orders" class="admin-content hidden"><div/);
  assert.match(html, /id="admin-orders-tab"/);
  assert.match(html, /id="admin-orders" class="space-y-3"/);
});
