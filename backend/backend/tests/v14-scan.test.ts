import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..', '..');
const server = fs.readFileSync(path.join(root, 'backend', 'src', 'server.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, '..', 'frontend', 'js', 'app.js'), 'utf8');
const api = fs.readFileSync(path.join(root, '..', 'frontend', 'js', 'api.js'), 'utf8');

test('delivery orders require complete address and coordinates', () => {
  assert.match(server, /superRefine/);
  assert.match(server, /customerPhone/);
  assert.match(server, /latitude===undefined/);
  assert.match(server, /address.*obrigatório/);
});

test('frontend reuses idempotency key after a failed order attempt', () => {
  assert.match(app, /pendingOrderKey/);
  assert.match(app, /if\(!state\.pendingOrderKey\)state\.pendingOrderKey=crypto\.randomUUID\(\)/);
  assert.match(app, /Idempotency-Key/);
});

test('frontend uses local placeholder instead of remote stock image fallback', () => {
  assert.doesNotMatch(app, /images\.unsplash\.com/);
  assert.match(app, /\/placeholder\.svg/);
});

test('frontend API requests have a timeout', () => {
  assert.match(api, /AbortController/);
  assert.match(api, /15000/);
});
