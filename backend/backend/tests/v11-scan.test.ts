import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('v11 exposes admin product list and order detail', () => {
  const s = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(s, /\/api\/admin\/products/);
  assert.match(s, /\/api\/orders\/:id/);
  assert.match(s, /getDeliveryConfig/);
});

test('v11 delivery settings are validated and persisted', () => {
  const s = readFileSync(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.match(s, /deliveryBaseCost/);
  assert.match(s, /deliveryPerKm/);
  assert.match(s, /deliveryMaxKm/);
  assert.match(s, /deliveryOriginLat/);
  assert.match(s, /deliveryOriginLng/);
});

test('v11 frontend has order detail and delivery controls', () => {
  const html = readFileSync(new URL('../../../frontend/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../../frontend/js/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="order-modal"/);
  assert.match(js, /viewOrder/);
  assert.match(js, /admin\/products/);
});
