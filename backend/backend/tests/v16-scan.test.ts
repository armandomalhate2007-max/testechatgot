import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const server = readFileSync(join(process.cwd(),'src/server.ts'),'utf8');
const security = readFileSync(join(process.cwd(),'src/security.ts'),'utf8');
test('v16 uses integer cents for order arithmetic',()=>{
  assert.match(server,/parseMoneyCents/); assert.match(server,/subtotalCents/); assert.match(server,/deliveryCostCents/); assert.match(server,/totalCents/);
  assert.doesNotMatch(server,/subtotal\s*\+=\s*line/);
});
test('v16 keeps delivery calculation in cents',()=>{ assert.match(security,/calculateDeliveryCostCents/); assert.match(security,/Math\.round\(km \* perKmCents\)/); });
test('v16 keeps stock decrement conditional',()=>{ assert.match(server,/stock:\{gte:i\.quantity\}/); assert.match(server,/data:\{stock:\{decrement:i\.quantity\}\}/); });
