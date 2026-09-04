import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { app, prisma } from '../src/server.js';

const dbUrl = process.env.DATABASE_URL || '';
const enabled = dbUrl.includes('atelier_test');
const skip = !enabled;
let cookie = '';

function updateCookie(setCookie: string | string[] | undefined) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const jar = new Map<string,string>();
  for (const part of cookie.split('; ')) {
    const [k,v] = part.split('='); if (k && v) jar.set(k,v);
  }
  for (const header of list) {
    const pair = header.split(';',1)[0];
    const [k,v] = pair.split('='); if (k && v) jar.set(k,v);
  }
  cookie = [...jar.entries()].map(([k,v])=>`${k}=${v}`).join('; ');
}

async function request(method:string, url:string, body?:unknown, headers:Record<string,string>={}) {
  const res = await app.inject({method, url, payload: body, headers: {...headers, ...(cookie ? {cookie} : {})}});
  updateCookie(res.headers['set-cookie'] as string|string[]|undefined);
  return res;
}

const run = (name:string, fn:()=>Promise<void>) => test(name, {skip}, fn);

before(async()=>{
  if (!enabled) return;
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.orderItem.deleteMany(), prisma.order.deleteMany(),
    prisma.productSize.deleteMany(), prisma.product.deleteMany(), prisma.session.deleteMany(),
    prisma.setting.deleteMany(), prisma.user.deleteMany()
  ]);
  const passwordHash = await argon2.hash('integration-secret');
  await prisma.user.create({data:{email:'integration@atelier.test',passwordHash}});
  await app.ready();
});

after(async()=>{ await app.close(); await prisma.$disconnect(); });

run('CORS permits credentialed frontend origin', async()=>{
  const res = await app.inject({method:'OPTIONS',url:'/api/products',headers:{origin:'http://localhost:5500','access-control-request-method':'GET'}});
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5500');
  assert.equal(res.headers['access-control-allow-credentials'], 'true');
});

run('login, CSRF and real TOTP 2FA work end-to-end', async()=>{
  let res = await request('POST','/api/auth/login',{email:'integration@atelier.test',password:'integration-secret'});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.json(),{authenticated:true});
  res = await request('GET','/api/auth/csrf');
  assert.equal(res.statusCode,200);
  const csrf = (res.json() as any).token;
  assert.ok(csrf);

  res = await request('POST','/api/auth/2fa/setup',undefined,{'x-csrf-token':csrf});
  assert.equal(res.statusCode,200);
  const secret = (res.json() as any).secret;
  assert.ok(secret);
  const code = authenticator.generate(secret);
  res = await request('POST','/api/auth/2fa/enable',{code},{'x-csrf-token':csrf});
  assert.equal(res.statusCode,200);

  res = await request('GET','/api/auth/csrf');
  const logoutCsrf=(res.json() as any).token;
  res = await request('POST','/api/auth/logout',undefined,{'x-csrf-token':logoutCsrf});
  assert.equal(res.statusCode,200);
  res = await request('POST','/api/auth/login',{email:'integration@atelier.test',password:'integration-secret'});
  assert.equal(res.statusCode,200);
  assert.equal((res.json() as any).requires2FA,true);
  res = await request('POST','/api/auth/2fa/verify',{code:authenticator.generate(secret)});
  assert.equal(res.statusCode,200);
  assert.equal((res.json() as any).authenticated,true);
});

run('admin product creation requires CSRF', async()=>{
  let res = await request('GET','/api/auth/csrf');
  const csrf=(res.json() as any).token;
  res = await request('POST','/api/products',{name:'Concorrência',ref:'TEST-CONC',price:100,currency:'MT',sizes:[{size:'M',stock:5}]});
  assert.equal(res.statusCode,403);
  res = await request('POST','/api/products',{name:'Concorrência',ref:'TEST-CONC',price:100,currency:'MT',sizes:[{size:'M',stock:5}]},{'x-csrf-token':csrf});
  assert.equal(res.statusCode,201);
});

run('stock never goes negative under concurrent orders', async()=>{
  const p = await prisma.product.findUnique({where:{ref:'TEST-CONC'},include:{sizes:true}});
  assert.ok(p);
  const requests = Array.from({length:12},(_,i)=>request('POST','/api/orders',{items:[{productId:p!.id,size:'M',quantity:1}],fulfillmentMethod:'PICKUP'},{'Idempotency-Key':`concurrency-${i}`}));
  const results = await Promise.all(requests);
  const created = results.filter(r=>r.statusCode===201);
  const conflicts = results.filter(r=>r.statusCode===409);
  assert.equal(created.length,5);
  assert.equal(conflicts.length,7);
  const size=await prisma.productSize.findUnique({where:{productId_size:{productId:p!.id,size:'M'}}});
  assert.equal(size?.stock,0);
});

run('idempotency returns the same order without consuming stock twice', async()=>{
  const p = await prisma.product.findUnique({where:{ref:'TEST-CONC'},include:{sizes:true}});
  assert.ok(p);
  await prisma.productSize.update({where:{productId_size:{productId:p!.id,size:'M'}},data:{stock:1}});
  const key='same-order-key';
  const body={items:[{productId:p!.id,size:'M',quantity:1}],fulfillmentMethod:'PICKUP'};
  const a=await request('POST','/api/orders',body,{'Idempotency-Key':key});
  const b=await request('POST','/api/orders',body,{'Idempotency-Key':key});
  assert.equal(a.statusCode,201);
  assert.equal(b.statusCode,200);
  assert.equal((a.json() as any).id,(b.json() as any).id);
  const size=await prisma.productSize.findUnique({where:{productId_size:{productId:p!.id,size:'M'}}});
  assert.equal(size?.stock,0);
});
