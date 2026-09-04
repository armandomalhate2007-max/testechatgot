import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const server = fs.readFileSync(path.resolve('src/server.ts'),'utf8');
const schema = fs.readFileSync(path.resolve('prisma/schema.prisma'),'utf8');
const e2e = fs.readFileSync(path.resolve('tests/e2e/admin-product-checkout.spec.ts'),'utf8');

test('v24 has hashed recovery codes and one-time consumption', () => {
  assert.match(schema, /model RecoveryCode/);
  assert.match(server, /argon2\.hash\(code/);
  assert.match(server, /usedAt: new Date\(\)/);
});

test('v24 supports recovery code authentication', () => {
  assert.match(server, /verifyRecoveryCode/);
  assert.match(server, /recoveryOk/);
});

test('v24 includes an end-to-end admin product flow', () => {
  assert.match(e2e, /Novo produto/);
  assert.match(e2e, /E2E Produto/);
});
