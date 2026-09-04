import test from 'node:test';
import assert from 'node:assert/strict';
import { safeEqualHex, distanceKm, calculateDeliveryCost, canTransition } from '../src/security.js';

test('safeEqualHex rejects different lengths and accepts equal values', () => {
  assert.equal(safeEqualHex('abc', 'abc'), true);
  assert.equal(safeEqualHex('abc', 'abcd'), false);
});

test('distanceKm is zero for identical coordinates', () => {
  assert.ok(Math.abs(distanceKm(-25.9692, 32.5732, -25.9692, 32.5732)) < 1e-9);
});

test('delivery cost requires coordinates and enforces radius', () => {
  assert.throws(() => calculateDeliveryCost('DELIVERY', undefined, undefined, 0, 0, 10, 150, 25), /COORDINATES_REQUIRED/);
  assert.throws(() => calculateDeliveryCost('DELIVERY', 1, 1, 0, 0, 10, 150, 25), /OUTSIDE_DELIVERY_RADIUS/);
  assert.equal(calculateDeliveryCost('PICKUP', undefined, undefined, 0, 0, 10, 150, 25), 0);
});

test('order transitions follow business rules', () => {
  assert.equal(canTransition('PENDING', 'CONFIRMED'), true);
  assert.equal(canTransition('CONFIRMED', 'DELIVERED'), true);
  assert.equal(canTransition('DELIVERED', 'PENDING'), false);
  assert.equal(canTransition('CANCELLED', 'CONFIRMED'), false);
});
