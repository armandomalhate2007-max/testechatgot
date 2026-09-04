import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoneyCents, canTransition } from '../src/security.js';

test('money parser rejects unsafe integer overflow', () => {
  assert.throws(() => parseMoneyCents('9007199254740992.00'));
  assert.equal(parseMoneyCents('123.45'), 12345);
});

test('delivered orders remain terminal', () => {
  assert.equal(canTransition('DELIVERED','CANCELLED'), false);
  assert.equal(canTransition('DELIVERED','REJECTED'), false);
});

test('status transitions do not allow reopening terminal orders', () => {
  assert.equal(canTransition('CANCELLED','PENDING'), false);
  assert.equal(canTransition('REJECTED','CONFIRMED'), false);
});
