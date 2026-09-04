import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), '..', '..');
const frontend = readFileSync(join(root, 'frontend', 'index.html'), 'utf8');
const publicIndex = readFileSync(join(root, 'public', 'index.html'), 'utf8');
const app = readFileSync(join(root, 'public', 'js', 'app.js'), 'utf8');
const api = readFileSync(join(root, 'public', 'js', 'api.js'), 'utf8');
const server = readFileSync(join(root, 'backend', 'src', 'server.ts'), 'utf8');
const migration = readFileSync(join(root, 'backend', 'prisma', 'migrations', '20260904060000_production_reconciliation', 'migration.sql'), 'utf8');

test('public and frontend HTML stay identical', () => {
  assert.equal(publicIndex, frontend);
});

test('frontend contains the DOM contract required by app.js', () => {
  const required = [
    'store-page','store-title','products','cart-count','cart-modal','cart-items','cart-total',
    'login-page','admin-page','admin-content','admin-dashboard','admin-products-tab','admin-orders-tab',
    'admin-settings','admin-security','admin-audit','stat-sales','stat-orders','stat-products','stat-revenue',
    'product-search','product-pages','order-search','order-pages','audit-list',
    'cfg-name','cfg-currency','cfg-whatsapp','cfg-base','cfg-per-km','cfg-max-km','cfg-lat','cfg-lng',
    'pay-provider','pay-wallet','pay-token','pay-webhook','pay-mpesa','pay-emola','payment-config-status',
    'security-2fa-status','tfa-setup','tfa-secret','tfa-enable-code','recovery-count','recovery-current-code','recovery-codes',
    'current-password','new-password','reset-page','reset-email','reset-form','reset-new-password',
    'prod-modal','prod-modal-title','prod-id','prod-image','prod-name','prod-ref','prod-desc','prod-price','prod-currency',
    'prod-image-count','prod-image-inputs','prod-limited',
    'order-modal','order-detail','product-modal','modal-product','toast'
  ];
  for (const id of required) assert.match(frontend, new RegExp(`id=["']${id}["']`), `missing #${id}`);
});

test('production image uploads stay below the Vercel function payload limit', () => {
  assert.match(server, /MAX_IMAGE_BYTES = 4 \* 1024 \* 1024/);
  assert.match(server, /fileSize: MAX_IMAGE_BYTES/);
  assert.match(app, /4 \* 1024 \* 1024/);
  assert.match(api, /uploads\/image/);
});

test('production reconciliation migration contains image and payment structures', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "images" JSONB/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "Payment"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "PaymentEvent"/);
});

test('Vercel Blob is wired without exposing credentials to the browser', () => {
  assert.match(server, /from '@vercel\/blob'/);
  assert.match(server, /access: 'public'/);
  assert.doesNotMatch(app, /BLOB_READ_WRITE_TOKEN|CLICPAY_TOKEN|PAYMENT_WEBHOOK_SECRET/);
});
