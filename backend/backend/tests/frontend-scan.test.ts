import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync(join(process.cwd(), '../../frontend/js/app.js'), 'utf8');

test('frontend does not persist commercial state in localStorage', () => {
  assert.equal(/localStorage\.(getItem|setItem|removeItem|clear)/.test(app), false);
});

test('frontend escapes displayed product text', () => {
  assert.match(app, /function esc\(/);
  assert.doesNotMatch(app, /\$\{p\.(name|ref|description)\}/);
});

test('frontend uses server-created order ids', () => {
  assert.match(app, /createOrder\(/);
  assert.match(app, /Idempotency-Key/);
});
