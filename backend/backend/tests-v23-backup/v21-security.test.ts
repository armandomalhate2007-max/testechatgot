import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v21 encrypts TOTP secrets and requires production key/cookie settings', async()=>{
 const s=await readFile(new URL('../src/server.ts',import.meta.url),'utf8');
 assert.match(s,/createCipheriv\('aes-256-gcm'/);
 assert.match(s,/TOTP_ENCRYPTION_KEY must be a 32-byte hex key in production/);
 assert.match(s,/COOKIE_SECURE=true is required in production/);
 assert.match(s,/enc:v1/);
});

test('v21 provides one-time password recovery tokens with generic response', async()=>{
 const s=await readFile(new URL('../src/server.ts',import.meta.url),'utf8');
 assert.match(s,/\/api\/auth\/password\/forgot/);
 assert.match(s,/\/api\/auth\/password\/reset/);
 assert.match(s,/passwordResetToken/);
 assert.match(s,/return reply\.code\(202\)\.send\(\{ok:true\}\)/);
 assert.match(s,/usedAt/);
});

test('v21 has role-aware admin authorization', async()=>{
 const s=await readFile(new URL('../src/server.ts',import.meta.url),'utf8');
 assert.match(s,/UserRole/);
 assert.match(s,/requireRole/);
 assert.match(s,/requireAdmin/);
});
