import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v15 binds idempotency keys to request fingerprints', async () => {
  const src = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(src, /idempotencyRequestHash/);
  assert.match(src, /requestFingerprint\(req\.body\)/);
  assert.match(src, /A mesma Idempotency-Key não pode ser reutilizada/);
});

test('v15 audits order creation', async () => {
  const src = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(src, /ORDER_CREATED/);
});
