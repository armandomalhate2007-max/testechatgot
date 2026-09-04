import 'dotenv/config';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { hashToken, safeEqualHex, distanceKm, calculateDeliveryCostCents, parseMoneyCents, canTransition } from './security.js';
import { getPaymentProvider, verifyWebhook, mapStatus } from './payments.js';
import { put } from '@vercel/blob';

const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5500';
const app = Fastify({ logger: true, bodyLimit: 256 * 1024, trustProxy: process.env.TRUST_PROXY === 'true' });

declare module 'fastify' { interface FastifyRequest { rawBody?: string } }
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try { req.rawBody = String(body); done(null, JSON.parse(String(body))); } catch { done(new Error('JSON inválido')); }
});
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_HOURS || 8) * 60 * 60 * 1000;
const COOKIE_SAME_SITE = (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
if (process.env.NODE_ENV === 'production' && !COOKIE_SECURE) throw new Error('COOKIE_SECURE=true is required in production');
if (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(ORIGIN)) throw new Error('FRONTEND_ORIGIN must use HTTPS in production');
if (COOKIE_SAME_SITE === 'none' && !COOKIE_SECURE) throw new Error('COOKIE_SECURE=true is required with SameSite=None');
const DELIVERY_BASE_COST = Number(process.env.DELIVERY_BASE_COST || 150);
const DELIVERY_PER_KM = Number(process.env.DELIVERY_PER_KM || 25);
const DELIVERY_ORIGIN_LAT = Number(process.env.DELIVERY_ORIGIN_LAT || -25.9692);
const DELIVERY_ORIGIN_LNG = Number(process.env.DELIVERY_ORIGIN_LNG || 32.5732);
const DELIVERY_MAX_KM = Number(process.env.DELIVERY_MAX_KM || 100);
const SESSION_COOKIE = 'atelier_session';
const CSRF_COOKIE = 'atelier_csrf';
const TOTP_KEY_HEX = process.env.TOTP_ENCRYPTION_KEY || '';
if (process.env.NODE_ENV === 'production' && !/^[0-9a-fA-F]{64}$/.test(TOTP_KEY_HEX)) {
  throw new Error('TOTP_ENCRYPTION_KEY must be a 32-byte hex key in production');
}
const TOTP_KEY = /^[0-9a-fA-F]{64}$/.test(TOTP_KEY_HEX) ? Buffer.from(TOTP_KEY_HEX, 'hex') : createHash('sha256').update(process.env.TOTP_ENCRYPTION_KEY || 'atelier-dev-only-totp-key').digest();
function encryptSecret(secret:string) {
  const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',TOTP_KEY,iv); const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]); const tag=cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}
function decryptSecret(value:string) {
  if(!value.startsWith('enc:v1:')) return value; const [, , ivB64, tagB64, dataB64]=value.split(':');
  const decipher=createDecipheriv('aes-256-gcm',TOTP_KEY,Buffer.from(ivB64,'base64url')); decipher.setAuthTag(Buffer.from(tagB64,'base64url')); return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64url')),decipher.final()]).toString('utf8');
}
function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(6).toString('hex').toUpperCase();
    return `${raw.slice(0,4)}-${raw.slice(4)}`;
  });
}

async function verifyRecoveryCode(userId: string, code: string) {
  const rows = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const row of rows) {
    if (await argon2.verify(row.codeHash, code.toUpperCase())) {
      await prisma.recoveryCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}


await app.register(cors, { origin: ORIGIN, credentials: true, methods: ['GET','POST','PATCH','DELETE','OPTIONS'] });
await app.register(cookie);
await app.register(helmet);
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Na Vercel (e em qualquer Lambda) o filesystem do bundle é só-leitura; apenas /tmp é gravável,
// e /tmp não é partilhado nem persistente entre invocações. Isto permite o boot sem crash,
// mas uploads feitos em produção na Vercel não sobrevivem — usar um storage externo (S3/R2/Vercel Blob).
const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : path.resolve(__dirname, '../uploads'));
await mkdir(UPLOAD_DIR, { recursive: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8 } });
await app.register(fastifyStatic, { root: UPLOAD_DIR, prefix: '/uploads/', index: false, decorateReply: false });

function newToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, canonicalize(v)]));
  return value;
}
function requestFingerprint(body: unknown) {
  return createHash('sha256').update(JSON.stringify(canonicalize(body))).digest('hex');
}

async function getSession(req: FastifyRequest, pending = false) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hash(token) } });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.twoFactorPending !== pending) return null;
  return session;
}

async function requireAuth(req: AuthRequest, reply: FastifyReply) {
  const session = await getSession(req, false);
  if (!session) return reply.code(401).send({ error: 'Não autenticado' });
  req.userId = session.userId;
  req.sessionId = session.id;
  req.csrfToken = req.cookies[CSRF_COOKIE];
}

async function requireCsrf(req: AuthRequest, reply: FastifyReply) {
  await requireAuth(req, reply);
  if (reply.sent) return;
  const header = req.headers['x-csrf-token'];
  const cookieToken = req.cookies[CSRF_COOKIE];
  if (typeof header !== 'string' || !cookieToken || !safeEqualHex(hash(header), hash(cookieToken))) {
    return reply.code(403).send({ error: 'CSRF inválido' });
  }
  const session = await prisma.session.findUnique({ where: { id: req.sessionId! } });
  if (!session || !safeEqualHex(session.csrfTokenHash, hash(cookieToken))) return reply.code(403).send({ error: 'CSRF inválido' });
}

type AuthRequest = FastifyRequest & { userId?: string; sessionId?: string; csrfToken?: string; userRole?: 'ADMIN'|'MANAGER' };
async function requireRole(req: AuthRequest, reply: FastifyReply, roles: Array<'ADMIN'|'MANAGER'>) {
  await requireAuth(req, reply); if (reply.sent) return;
  const user=await prisma.user.findUnique({where:{id:req.userId!},select:{role:true}});
  if(!user || !roles.includes(user.role as 'ADMIN'|'MANAGER')) return reply.code(403).send({error:'Permissões insuficientes'});
  req.userRole=user.role as 'ADMIN'|'MANAGER';
}
const requireAdmin = (req: AuthRequest, reply: FastifyReply) => requireRole(req, reply, ['ADMIN']);
const hash = hashToken;
const issueSession = async (userId: string, reply: FastifyReply) => {
  const token = newToken();
  const csrf = newToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hash(token), csrfTokenHash: hash(csrf), userId, expiresAt, twoFactorPending: false } });
  reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, path: '/', maxAge: Math.floor(SESSION_TTL_MS / 1000) });
  reply.setCookie(CSRF_COOKIE, csrf, { httpOnly: false, secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, path: '/', maxAge: Math.floor(SESSION_TTL_MS / 1000) });
};

app.get('/api/health', async (req, reply) => {
  try { await prisma.$queryRaw`SELECT 1`; return { ok: true, service: 'atelier-api', requestId: req.id }; }
  catch { return reply.code(503).send({ ok: false, service: 'atelier-api', requestId: req.id }); }
});

app.setErrorHandler((error, req, reply) => {
  req.log.error({ err: error, requestId: req.id }, 'request_failed');
  if (reply.sent) return;
  return reply.code((error as any).statusCode && (error as any).statusCode < 500 ? (error as any).statusCode : 500).send({ error: 'Erro interno do servidor', requestId: req.id });
});

setInterval(() => { prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => undefined); prisma.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] } }).catch(() => undefined); }, 60 * 60 * 1000).unref();

async function audit(userId: string | undefined, action: string, entity: string, entityId?: string, metadata?: unknown) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, metadata: metadata as any } }).catch(() => undefined);
}

async function getDeliveryConfig() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['deliveryBaseCost','deliveryPerKm','deliveryOriginLat','deliveryOriginLng','deliveryMaxKm'] } } });
  const values = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    baseCost: values.deliveryBaseCost ?? String(DELIVERY_BASE_COST),
    perKm: values.deliveryPerKm ?? String(DELIVERY_PER_KM),
    originLat: Number(values.deliveryOriginLat ?? DELIVERY_ORIGIN_LAT),
    originLng: Number(values.deliveryOriginLng ?? DELIVERY_ORIGIN_LNG),
    maxKm: Number(values.deliveryMaxKm ?? DELIVERY_MAX_KM),
  };
}

app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (req, reply) => {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Credenciais inválidas' });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) return reply.code(401).send({ error: 'Credenciais inválidas' });
  if (user.twoFactorEnabled) {
    const challenge = newToken();
    const challengeHash = hash(challenge);
    await prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { gt: new Date() } } });
    await prisma.session.create({ data: { tokenHash: challengeHash, csrfTokenHash: challengeHash, userId: user.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000), twoFactorPending: true } });
    reply.setCookie(SESSION_COOKIE, challenge, { httpOnly: true, secure: COOKIE_SECURE, sameSite: COOKIE_SAME_SITE, path: '/', maxAge: 300 });
    return { requires2FA: true };
  }
  await issueSession(user.id, reply);
  await audit(user.id, 'LOGIN_SUCCESS', 'User', user.id);
  return { authenticated: true };
});

app.post('/api/auth/2fa/verify', { config: { rateLimit: { max: 8, timeWindow: '10 minutes' } } }, async (req, reply) => {
  const code = z.object({ code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{8})$/) }).safeParse(req.body);
  if (!code.success) return reply.code(400).send({ error: 'Código inválido' });
  const session = await getSession(req, true);
  if (!session || !session.twoFactorPending) return reply.code(401).send({ error: 'Desafio expirado' });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) return reply.code(401).send({ error: 'Código inválido' });
  const totpOk = authenticator.check(code.data.code, decryptSecret(user.twoFactorSecret));
  const recoveryOk = !totpOk && await verifyRecoveryCode(user.id, code.data.code);
  if (!totpOk && !recoveryOk) return reply.code(401).send({ error: 'Código inválido' });
  if (!user.twoFactorSecret.startsWith('enc:v1:')) await prisma.user.update({ where:{id:user.id}, data:{twoFactorSecret:encryptSecret(user.twoFactorSecret)} });
  await prisma.session.delete({ where: { id: session.id } });
  await issueSession(user.id, reply);
  await audit(user.id, 'LOGIN_2FA_SUCCESS', 'User', user.id);
  return { authenticated: true };
});

app.get('/api/auth/me', { preHandler: requireAuth }, async (req: AuthRequest) => prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, email: true, role: true, twoFactorEnabled: true } }));
app.get('/api/auth/csrf', { preHandler: requireAuth }, async (req) => ({ token: req.cookies[CSRF_COOKIE] || null }));

app.post('/api/auth/logout', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
  if (req.userId) await audit(req.userId, 'LOGOUT', 'User', req.userId);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
  return { ok: true };
});

app.post('/api/auth/password/forgot', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req, reply) => {
  const parsed=z.object({email:z.string().email().max(254)}).safeParse(req.body);
  if(!parsed.success) return reply.code(202).send({ok:true});
  const user=await prisma.user.findUnique({where:{email:parsed.data.email.toLowerCase()}});
  if(user){
    await prisma.passwordResetToken.deleteMany({where:{userId:user.id}});
    const token=newToken(32); await prisma.passwordResetToken.create({data:{tokenHash:hash(token),userId:user.id,expiresAt:new Date(Date.now()+30*60*1000)}});
    const resetUrl=`${ORIGIN}/?reset=${encodeURIComponent(token)}`;
    const webhook=process.env.PASSWORD_RESET_WEBHOOK_URL;
    if(webhook){ try{ await fetch(webhook,{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({email:user.email,resetUrl,expiresInMinutes:30})}); }catch(e){ req.log.error({err:e},'password_reset_delivery_failed'); } }
    else req.log.warn({userId:user.id},'password_reset_webhook_not_configured');
    await audit(user.id,'PASSWORD_RESET_REQUESTED','User',user.id);
  }
  return reply.code(202).send({ok:true});
});
app.post('/api/auth/password/reset', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (req, reply) => {
  const parsed=z.object({token:z.string().min(20).max(200),newPassword:z.string().min(12).max(200)}).safeParse(req.body);
  if(!parsed.success) return reply.code(400).send({error:'Token ou palavra-passe inválidos'});
  const row=await prisma.passwordResetToken.findUnique({where:{tokenHash:hash(parsed.data.token)}});
  if(!row || row.usedAt || row.expiresAt<=new Date()) return reply.code(400).send({error:'Token inválido ou expirado'});
  const passwordHash=await argon2.hash(parsed.data.newPassword,{type:argon2.argon2id});
  await prisma.$transaction([prisma.user.update({where:{id:row.userId},data:{passwordHash}}),prisma.passwordResetToken.update({where:{id:row.id},data:{usedAt:new Date()}}),prisma.session.deleteMany({where:{userId:row.userId}})]);
  await audit(row.userId,'PASSWORD_RESET_COMPLETED','User',row.userId); return {ok:true};
});

app.post('/api/auth/password/change', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const parsed = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'A nova palavra-passe deve ter pelo menos 12 caracteres.' });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user || !(await argon2.verify(user.passwordHash, parsed.data.currentPassword))) return reply.code(401).send({ error: 'Palavra-passe atual inválida' });
  const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
  await prisma.$transaction([prisma.user.update({ where: { id: user.id }, data: { passwordHash } }), prisma.session.deleteMany({ where: { userId: user.id } })]);
  await issueSession(user.id, reply);
  await audit(user.id, 'PASSWORD_CHANGED', 'User', user.id);
  return { ok: true };
});

app.post('/api/auth/2fa/setup', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return reply.code(404).send({ error: 'Utilizador não encontrado' });
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false } });
  await audit(user.id, '2FA_SETUP_STARTED', 'User', user.id);
  return { secret, otpauthUrl: authenticator.keyuri(user.email, 'Atelier', secret) };
});

app.post('/api/auth/2fa/enable', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const parsed = z.object({ code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{8})$/) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Código inválido' });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.twoFactorSecret || !authenticator.check(parsed.data.code, decryptSecret(user.twoFactorSecret))) return reply.code(400).send({ error: 'Código inválido' });
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
  const recoveryCodes = generateRecoveryCodes();
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
  for (const recoveryCode of recoveryCodes) await prisma.recoveryCode.create({ data: { userId: user.id, codeHash: await argon2.hash(recoveryCode, { type: argon2.argon2id }) } });
  await audit(user.id, '2FA_ENABLED', 'User', user.id);
  return { enabled: true, recoveryCodes };
});

app.post('/api/auth/2fa/recovery/regenerate', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const parsed = z.object({ code: z.string().regex(/^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{8})$/) }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Código inválido' });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret || !authenticator.check(parsed.data.code, decryptSecret(user.twoFactorSecret))) return reply.code(401).send({ error: 'Código inválido' });
  const codes = generateRecoveryCodes();
  await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
  await Promise.all(codes.map(async code => prisma.recoveryCode.create({ data: { userId: user.id, codeHash: await argon2.hash(code, { type: argon2.argon2id }) } })));
  await audit(user.id, '2FA_RECOVERY_CODES_REGENERATED', 'User', user.id);
  return { codes };
});

app.get('/api/auth/2fa/recovery/status', { preHandler: requireAuth }, async (req: AuthRequest) => {
  const count = await prisma.recoveryCode.count({ where: { userId: req.userId, usedAt: null } });
  return { remaining: count };
});

app.get('/api/products', async () => prisma.product.findMany({ where: { active: true }, include: { sizes: true }, orderBy: { createdAt: 'desc' } }));
app.get('/api/admin/products', { preHandler: requireAdmin }, async (req, reply) => {
  const q = z.object({ q: z.string().trim().max(120).optional(), active: z.enum(['all','active','inactive']).default('all'), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(req.query);
  if (!q.success) return reply.code(400).send({ error: 'Filtros inválidos' });
  const where:any = {};
  if (q.data.q) where.OR = [{ name: { contains: q.data.q, mode: 'insensitive' } }, { ref: { contains: q.data.q, mode: 'insensitive' } }];
  if (q.data.active === 'active') where.active = true;
  if (q.data.active === 'inactive') where.active = false;
  const [items,total] = await prisma.$transaction([
    prisma.product.findMany({ where, include:{sizes:true}, orderBy:{createdAt:'desc'}, skip:(q.data.page-1)*q.data.pageSize, take:q.data.pageSize }),
    prisma.product.count({ where })
  ]);
  return { items, total, page:q.data.page, pageSize:q.data.pageSize, pages:Math.max(1,Math.ceil(total/q.data.pageSize)) };
});
app.get('/api/products/:id', async (req: any, reply) => { const p = await prisma.product.findFirst({ where: { id: req.params.id, active: true }, include: { sizes: true } }); if (!p) return reply.code(404).send({ error: 'Produto não encontrado' }); return p; });

const imageUrlSchema = z.string()
  .trim()
  .max(2000)
  .refine(
    v => !v || /^https?:\/\//i.test(v) || /^\/uploads\/[A-Za-z0-9._-]+$/.test(v),
    'URL de imagem inválida'
  );

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ref: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).optional(),
  price: z.number()
    .positive()
    .finite()
    .refine(v => /^\d+(?:\.\d{1,2})?$/.test(v.toFixed(2)), 'Preço inválido'),
  currency: z.enum(['MT','EUR','USD','BRL','GBP']).default('MT'),
  imageUrl: imageUrlSchema.optional().or(z.literal('')),
  images: z.array(imageUrlSchema).max(6).default([]),
  limited: z.boolean().default(false),
  active: z.boolean().default(true),
  sizes: z.array(z.object({
    size: z.string().trim().min(1).max(20),
    stock: z.number().int().min(0).max(100000)
  })).optional()
});

app.post('/api/uploads/image', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: 'Ficheiro de imagem obrigatório' });
  const allowed: Record<string,string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const ext = allowed[part.mimetype];
  if (!ext) return reply.code(400).send({ error: 'Formato de imagem não suportado' });
  const filename = `${randomBytes(18).toString('hex')}.${ext}`;
  const target = path.join(UPLOAD_DIR, filename);
  try {
    const buffer = await part.toBuffer();
    const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng = buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    const isWebp = buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP';
    if ((ext === 'jpg' && !isJpeg) || (ext === 'png' && !isPng) || (ext === 'webp' && !isWebp)) return reply.code(400).send({ error: 'Conteúdo da imagem inválido' });
    if (process.env.VERCEL) {
      const blob = await put(`products/${filename}`, buffer, {
        access: 'public',
        contentType: part.mimetype,
        addRandomSuffix: false
      });
      await audit(req.userId, 'IMAGE_UPLOADED', 'Upload', filename, { mimeType: part.mimetype, bytes: buffer.length, storage: 'vercel-blob' });
      return reply.code(201).send({ imageUrl: blob.url });
    }

    await writeFile(target, buffer, { flag: 'wx' });
    await audit(req.userId, 'IMAGE_UPLOADED', 'Upload', filename, { mimeType: part.mimetype, bytes: buffer.length, storage: 'local' });
    return reply.code(201).send({ imageUrl: `/uploads/${filename}` });
  } catch (e:any) {
    if (e?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: 'Imagem demasiado grande' });
    return reply.code(400).send({ error: 'Imagem inválida' });
  }
});

app.post('/api/delivery/quote', async (req, reply) => {
  const parsed = z.object({ fulfillmentMethod: z.enum(['DELIVERY','PICKUP']).default('DELIVERY'), currency: z.enum(['MT','EUR','USD','BRL','GBP']).default('MT'), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional() }).safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Dados de entrega inválidos' });
  try {
    const cfg = await getDeliveryConfig();
    const costCents = calculateDeliveryCostCents(parsed.data.fulfillmentMethod, parsed.data.latitude, parsed.data.longitude, cfg.originLat, cfg.originLng, cfg.maxKm, parseMoneyCents(cfg.baseCost), parseMoneyCents(cfg.perKm));
    return { deliveryCost: (costCents/100).toFixed(2), currency: parsed.data.currency, maxKm: cfg.maxKm };
  } catch (e: any) {
    if (e?.message === 'OUTSIDE_DELIVERY_RADIUS') return reply.code(400).send({ error: 'A morada está fora da área de entrega.' });
    return reply.code(400).send({ error: 'Coordenadas são obrigatórias para entrega.' });
  }
});

app.post('/api/products', { preHandler: requireCsrf }, async (req: AuthRequest, reply: FastifyReply) => {
  const p = productSchema.safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: 'Dados de produto inválidos', details: p.error.flatten() });

  try {
    const images = p.data.images.length
      ? p.data.images
      : (p.data.imageUrl ? [p.data.imageUrl] : []);

    const created = await prisma.product.create({
      data: {
        name: p.data.name,
        ref: p.data.ref,
        description: p.data.description || null,
        price: p.data.price,
        currency: p.data.currency,
        imageUrl: images[0] || null,
        images,
        limited: p.data.limited,
        active: p.data.active,
        sizes: {
          create: (p.data.sizes || []).map(s => ({ size: s.size, stock: s.stock }))
        }
      },
      include: { sizes: true }
    });

    await audit(req.userId, 'PRODUCT_CREATED', 'Product', created.id, { ref: created.ref });
    return reply.code(201).send(created);
  } catch {
    return reply.code(409).send({ error: 'Referência de produto já existe' });
  }
});
app.patch('/api/products/:id', { preHandler: requireCsrf }, async (req: AuthRequest, reply: FastifyReply) => {
  const p = productSchema.partial().safeParse(req.body);
  if (!p.success) return reply.code(400).send({ error: 'Dados inválidos' });

  try {
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.product.findUnique({
        where: { id: (req.params as any).id }
      });

      if (!current) throw new Error('NOT_FOUND');

      const currentImages = Array.isArray(current.images)
        ? (current.images as string[])
        : (current.imageUrl ? [current.imageUrl] : []);

      const images = p.data.images !== undefined
        ? p.data.images
        : currentImages;

      const product = await tx.product.update({
        where: { id: (req.params as any).id },
        data: {
          name: p.data.name,
          ref: p.data.ref,
          description: p.data.description,
          imageUrl: images[0] || p.data.imageUrl || null,
          images,
          limited: p.data.limited,
          active: p.data.active,
          price: p.data.price,
          currency: p.data.currency
        }
      });

      if (p.data.sizes) {
        for (const s of p.data.sizes) {
          await tx.productSize.upsert({
            where: { productId_size: { productId: product.id, size: s.size } },
            create: { productId: product.id, size: s.size, stock: s.stock },
            update: { stock: s.stock }
          });
        }
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: { sizes: true }
      });
    });

    await audit(req.userId, 'PRODUCT_UPDATED', 'Product', updated?.id);
    return updated;
  } catch (e: any) {
    return reply.code(e?.message === 'NOT_FOUND' ? 404 : 400).send({
      error: e?.message === 'NOT_FOUND'
        ? 'Produto não encontrado'
        : 'Não foi possível atualizar'
    });
  }
});
app.delete('/api/products/:id', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => { try { await prisma.product.update({ where:{id:(req.params as any).id}, data:{active:false} }); await audit(req.userId, 'PRODUCT_DEACTIVATED', 'Product', (req.params as any).id); return {ok:true}; } catch { return reply.code(404).send({error:'Produto não encontrado'}); } });
app.post('/api/products/:id/restore', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => { try { const p=await prisma.product.update({ where:{id:(req.params as any).id}, data:{active:true}, include:{sizes:true} }); await audit(req.userId,'PRODUCT_RESTORED','Product',p.id,{ref:p.ref}); return p; } catch { return reply.code(404).send({error:'Produto não encontrado'}); } });

async function getPaymentConfig() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['payment.provider','payment.clicpay.baseUrl','payment.clicpay.walletId','payment.clicpay.token','payment.clicpay.webhookSecret','payment.mpesa.enabled','payment.emola.enabled'] } } });
  const values=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  return {
    provider: values['payment.provider'] || process.env.PAYMENT_PROVIDER || 'mock',
    baseUrl: values['payment.clicpay.baseUrl'] || process.env.CLICPAY_BASE_URL,
    walletId: values['payment.clicpay.walletId'] || process.env.CLICPAY_WALLET_ID,
    token: values['payment.clicpay.token'] ? decryptSecret(values['payment.clicpay.token']) : process.env.CLICPAY_TOKEN,
    webhookSecret: values['payment.clicpay.webhookSecret'] ? decryptSecret(values['payment.clicpay.webhookSecret']) : process.env.PAYMENT_WEBHOOK_SECRET,
    mpesaEnabled: values['payment.mpesa.enabled'] !== 'false',
    emolaEnabled: values['payment.emola.enabled'] !== 'false'
  };
}

const orderSchema = z.object({ items:z.array(z.object({productId:z.string().min(1),size:z.string().trim().min(1).max(20),quantity:z.number().int().min(1).max(100)})).min(1).max(50), fulfillmentMethod:z.enum(['DELIVERY','PICKUP']).default('DELIVERY'), customerName:z.string().trim().min(2).max(120).optional(), customerPhone:z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/).optional(), country:z.string().trim().min(2).max(80).optional(), city:z.string().trim().min(2).max(120).optional(), address:z.string().trim().min(5).max(500).optional(), latitude:z.number().min(-90).max(90).optional(), longitude:z.number().min(-180).max(180).optional() }).superRefine((data,ctx)=>{
  if(!data.customerName) ctx.addIssue({code:'custom',path:['customerName'],message:'Nome é obrigatório'});
  if(!data.customerPhone) ctx.addIssue({code:'custom',path:['customerPhone'],message:'Telefone é obrigatório'});
  if(data.fulfillmentMethod==='DELIVERY'){
    for(const [key,label] of [['country','país'],['city','cidade'],['address','morada']] as const){ if(!data[key]) ctx.addIssue({code:'custom',path:[key],message:`${label} é obrigatório para entrega`}); }
    if(data.latitude===undefined || data.longitude===undefined) ctx.addIssue({code:'custom',path:['latitude'],message:'Localização é obrigatória para entrega'});
  }
});

app.post('/api/orders', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
  const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim().slice(0, 100) : undefined;
  const requestHash = requestFingerprint(req.body);
  if (idempotencyKey) {
    const existing = await prisma.order.findUnique({where:{idempotencyKey}});
    if (existing) {
      if (existing.idempotencyRequestHash && existing.idempotencyRequestHash !== requestHash) return reply.code(409).send({error:'A mesma Idempotency-Key não pode ser reutilizada para outro pedido.'});
      return reply.code(200).send(existing);
    }
  }
  const parsed = orderSchema.safeParse(req.body); if (!parsed.success) return reply.code(400).send({error:'Pedido inválido',details:parsed.error.flatten()});
  const ids = [...new Set(parsed.data.items.map(i=>i.productId))];
  const products = await prisma.product.findMany({where:{id:{in:ids},active:true},include:{sizes:true}});
  const byId = new Map(products.map(p=>[p.id,p]));
  const currencies = new Set<string>(); let subtotalCents = 0; const items:any[]=[];
  for (const i of parsed.data.items) { const p=byId.get(i.productId); if(!p)return reply.code(400).send({error:'Produto inválido'}); currencies.add(p.currency); const size=p.sizes.find(s=>s.size===i.size); if(!size || size.stock<i.quantity)return reply.code(409).send({error:`Stock insuficiente para ${p.name} (${i.size})`}); const unitCents=parseMoneyCents(p.price.toString()); const lineCents=unitCents*i.quantity; subtotalCents+=lineCents; items.push({productId:p.id,productNameSnapshot:p.name,productRefSnapshot:p.ref,unitPrice:(unitCents/100).toFixed(2),quantity:i.quantity,size:i.size,subtotal:(lineCents/100).toFixed(2)}); }
  if (currencies.size !== 1) return reply.code(400).send({error:'O pedido deve conter produtos na mesma moeda'});
  const currency = [...currencies][0] as any;
  let deliveryCostCents:number;
  try { const cfg = await getDeliveryConfig(); deliveryCostCents = calculateDeliveryCostCents(parsed.data.fulfillmentMethod, parsed.data.latitude, parsed.data.longitude, cfg.originLat, cfg.originLng, cfg.maxKm, parseMoneyCents(cfg.baseCost), parseMoneyCents(cfg.perKm)); } catch (e:any) {
    if (e?.message === 'OUTSIDE_DELIVERY_RADIUS') return reply.code(400).send({error:'A morada está fora da área de entrega.'});
    return reply.code(400).send({error:'Coordenadas são obrigatórias para entrega. Escolha retirada na loja se não quiser partilhar localização.'});
  }
  const totalCents=subtotalCents+deliveryCostCents;
  const subtotal=(subtotalCents/100).toFixed(2);
  const deliveryCost=(deliveryCostCents/100).toFixed(2);
  const total=(totalCents/100).toFixed(2);
  let order;
  try {
    order = await prisma.$transaction(async tx=>{ const o=await tx.order.create({data:{idempotencyKey,idempotencyRequestHash:requestHash,currency,subtotal,deliveryCost,total,fulfillmentMethod:parsed.data.fulfillmentMethod,customerName:parsed.data.customerName||null,customerPhone:parsed.data.customerPhone||null,country:parsed.data.country||null,city:parsed.data.city||null,address:parsed.data.address||null,latitude:parsed.data.latitude,longitude:parsed.data.longitude,items:{create:items}}}); for(const i of parsed.data.items){const result=await tx.productSize.updateMany({where:{productId:i.productId,size:i.size,stock:{gte:i.quantity}},data:{stock:{decrement:i.quantity}}}); if(result.count!==1) throw new Error('STOCK_CONFLICT');} return o; });
  } catch (e:any) {
    if (e?.code === 'P2002' && idempotencyKey) { const existing = await prisma.order.findUnique({where:{idempotencyKey}}); if (existing) return reply.code(200).send(existing); }
    if (e?.message === 'STOCK_CONFLICT') return reply.code(409).send({error:'Stock alterado. Reveja o carrinho e tente novamente.'});
    throw e;
  }
  await audit(undefined, 'ORDER_CREATED', 'Order', order.id, { fulfillmentMethod: order.fulfillmentMethod, currency: order.currency, totalCents: parseMoneyCents(order.total.toString()) });
  return reply.code(201).send(order);
});

async function reconcilePayment(paymentId:string){
  const payment=await prisma.payment.findUnique({where:{id:paymentId},include:{order:{include:{items:true}}}});
  if(!payment || !payment.providerReference || payment.provider==='manual') return payment;
  const paymentConfig=await getPaymentConfig();
  const provider=getPaymentProvider({provider:paymentConfig.provider,baseUrl:paymentConfig.baseUrl,token:paymentConfig.token,walletId:paymentConfig.walletId});
  if(!provider.query) return payment;
  const result=await provider.query(payment.providerReference);
  const now=new Date();
  const updated=await prisma.$transaction(async tx=>{
    const current=await tx.payment.findUnique({where:{id:payment.id},include:{order:{include:{items:true}}}});
    if(!current) return payment;
    const terminalFailure=['FAILED','CANCELLED','EXPIRED'].includes(result.status);
    const next=await tx.payment.update({where:{id:payment.id},data:{status:result.status,providerPayload:result.raw as any,paidAt:result.status==='PAID'?(current.paidAt||now):current.paidAt,refundedAt:result.status==='REFUNDED'?(current.refundedAt||now):current.refundedAt}});
    if(result.status==='PAID') await tx.order.updateMany({where:{id:current.orderId,status:'PENDING'},data:{status:'CONFIRMED'}});
    if(terminalFailure && current.order.status==='PENDING'){
      const claimed=await tx.order.updateMany({where:{id:current.orderId,status:'PENDING'},data:{status:'CANCELLED'}});
      if(claimed.count===1) for(const item of current.order.items) await tx.productSize.update({where:{productId_size:{productId:item.productId,size:item.size}},data:{stock:{increment:item.quantity}}});
    }
    await tx.paymentEvent.create({data:{paymentId:payment.id,type:'STATUS_REFRESH',payload:result.raw as any}}).catch(()=>{});
    return next;
  });
  return updated;
}

const paymentStartSchema=z.object({method:z.enum(['MANUAL','MPESA','EMOLA','MOCK'])});
app.post('/api/orders/:id/payments', { config:{rateLimit:{max:10,timeWindow:'1 minute'}} }, async(req,reply)=>{
  const parsed=paymentStartSchema.safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:'Método de pagamento inválido'});
  const order=await prisma.order.findUnique({where:{id:(req.params as any).id}}); if(!order)return reply.code(404).send({error:'Pedido não encontrado'});
  if(['CANCELLED','REJECTED'].includes(order.status))return reply.code(409).send({error:'Este pedido não pode ser pago'});
  const existing=await prisma.payment.findFirst({where:{orderId:order.id,status:{in:['PENDING','PROCESSING','PAID']}},orderBy:{createdAt:'desc'}});
  if(existing)return reply.send(existing);
  if(parsed.data.method==='MANUAL'){
    const payment=await prisma.payment.create({data:{orderId:order.id,method:'MANUAL',status:'PENDING',provider:'manual',idempotencyKey:`${order.id}:manual`,amount:order.total,currency:order.currency,customerPhone:order.customerPhone}});
    return reply.code(201).send(payment);
  }
  if(['MPESA','EMOLA'].includes(parsed.data.method) && order.currency!=='MT')return reply.code(400).send({error:'M-Pesa/e-Mola só estão disponíveis para pagamentos em MT'});
  if(!order.customerPhone)return reply.code(400).send({error:'Telefone do cliente em falta'});
  const key=`${order.id}:${parsed.data.method}:v1`; const paymentConfig=await getPaymentConfig(); if(parsed.data.method==='MPESA'&&!paymentConfig.mpesaEnabled)return reply.code(400).send({error:'M-Pesa está temporariamente indisponível'}); if(parsed.data.method==='EMOLA'&&!paymentConfig.emolaEnabled)return reply.code(400).send({error:'e-Mola está temporariamente indisponível'}); const provider=getPaymentProvider({provider:paymentConfig.provider,baseUrl:paymentConfig.baseUrl,token:paymentConfig.token,walletId:paymentConfig.walletId});
  const pending=await prisma.payment.create({data:{orderId:order.id,method:parsed.data.method,status:'PROCESSING',provider:provider.name,idempotencyKey:key,amount:order.total,currency:order.currency,customerPhone:order.customerPhone}}).catch(async(e:any)=>{if(e?.code==='P2002')return prisma.payment.findUniqueOrThrow({where:{idempotencyKey:key}});throw e;});
  if(pending.providerReference)return reply.send(pending);
  try{
    const charge=await provider.createCharge({amount:order.total.toString(),currency:order.currency,phone:order.customerPhone,reference:order.id,idempotencyKey:key,method:parsed.data.method});
    const payment=await prisma.payment.update({where:{id:pending.id},data:{providerReference:charge.providerReference,status:charge.status,providerPayload:charge.raw as any,paidAt:charge.status==='PAID'?new Date():null}});
    if(charge.status==='PAID' && order.status==='PENDING') await prisma.order.updateMany({where:{id:order.id,status:'PENDING'},data:{status:'CONFIRMED'}});
    await audit(undefined,'PAYMENT_STARTED','Payment',payment.id,{orderId:order.id,method:payment.method,provider:payment.provider}); return reply.code(201).send(payment);
  }catch(e:any){await prisma.payment.update({where:{id:pending.id},data:{status:'FAILED',failureReason:String(e?.message||'provider_error').slice(0,500)}});return reply.code(502).send({error:'Não foi possível iniciar o pagamento. Tente novamente.'});}
});

app.get('/api/orders/:id/payment', async(req,reply)=>{
  const p=await prisma.payment.findFirst({where:{orderId:(req.params as any).id},orderBy:{createdAt:'desc'},select:{id:true,method:true,status:true,provider:true,providerReference:true,amount:true,currency:true,createdAt:true,updatedAt:true}});
  if(!p)return reply.code(404).send({error:'Pagamento não encontrado'}); return p;
});

app.post('/api/payments/:id/refresh', { config:{rateLimit:{max:12,timeWindow:'1 minute'}} }, async(req,reply)=>{
  try {
    const current=await prisma.payment.findUnique({where:{id:(req.params as any).id}});
    if(!current)return reply.code(404).send({error:'Pagamento não encontrado'});
    if(['PAID','FAILED','CANCELLED','REFUNDED','EXPIRED'].includes(current.status)) return current;
    const updated=await reconcilePayment(current.id);
    return updated;
  } catch(e:any) {
    req.log.warn({err:e,paymentId:(req.params as any).id},'payment_refresh_failed');
    return reply.code(502).send({error:'Não foi possível consultar o estado do pagamento.'});
  }
});

app.post('/api/payments/webhook', { config:{rateLimit:{max:120,timeWindow:'1 minute'}} }, async(req,reply)=>{
  const raw=req.rawBody||JSON.stringify(req.body||{}); const paymentConfig=await getPaymentConfig(); const sig=(typeof req.headers['x-webhook-signature']==='string'?req.headers['x-webhook-signature']:undefined) || (typeof req.headers['x-clicpay-signature']==='string'?req.headers['x-clicpay-signature']:undefined);
  if(paymentConfig.provider!=='mock' && !verifyWebhook(raw,sig,paymentConfig.webhookSecret))return reply.code(401).send({error:'Assinatura inválida'});
  const body:any=req.body||{}; const data:any=body.data&&typeof body.data==='object'?body.data:body; const ref=String(data.clicpay_reference||data.provider_reference||data.id||data.transaction_id||data.reference||''); if(!ref)return reply.code(400).send({error:'Referência em falta'});
  const payment=await prisma.payment.findUnique({where:{providerReference:ref},include:{order:true}}); if(!payment)return reply.code(202).send({ok:true});
  const webhookAmount=Number(data.amount??data.received_amount); const expectedAmount=Number(payment.amount); if(Number.isFinite(webhookAmount)&&Math.abs(webhookAmount-expectedAmount)>0.001)return reply.code(400).send({error:'Valor do pagamento não corresponde ao pedido'});
  const webhookCurrency=String(data.currency||'MZN').toUpperCase(); if(payment.currency==='MT'&&webhookCurrency!=='MZN')return reply.code(400).send({error:'Moeda do pagamento não corresponde ao pedido'});
  const status=mapStatus(data.status);
  const eventId=typeof req.headers['x-webhook-id']==='string'?req.headers['x-webhook-id']:undefined;
  if(eventId){const seen=await prisma.paymentEvent.findUnique({where:{providerEventId:eventId}}); if(seen)return {ok:true};}
  const updated=await prisma.$transaction(async tx=>{
    const current=await tx.payment.findUnique({where:{id:payment.id},include:{order:{include:{items:true}}}});
    if(!current)return payment;
    const next=await tx.payment.update({where:{id:payment.id},data:{status,providerPayload:body,providerTransactionId:data.transaction_id?String(data.transaction_id):current.providerTransactionId,paidAt:status==='PAID'?(current.paidAt||new Date()):current.paidAt,refundedAt:status==='REFUNDED'?(current.refundedAt||new Date()):current.refundedAt}});
    if(status==='PAID') await tx.order.updateMany({where:{id:current.orderId,status:'PENDING'},data:{status:'CONFIRMED'}});
    if(['FAILED','CANCELLED','EXPIRED'].includes(status) && current.order.status==='PENDING'){
      const claimed=await tx.order.updateMany({where:{id:current.orderId,status:'PENDING'},data:{status:'CANCELLED'}});
      if(claimed.count===1) for(const item of current.order.items) await tx.productSize.update({where:{productId_size:{productId:item.productId,size:item.size}},data:{stock:{increment:item.quantity}}});
    }
    if(eventId) await tx.paymentEvent.create({data:{paymentId:payment.id,type:String(req.headers['x-event-type']||'WEBHOOK'),providerEventId:eventId,payload:body}});
    else await tx.paymentEvent.create({data:{paymentId:payment.id,type:'WEBHOOK',payload:body}});
    return next;
  });
  await audit(undefined,'PAYMENT_WEBHOOK','Payment',payment.id,{status,orderId:payment.orderId}); return {ok:true};
});

app.patch('/api/payments/:id/status',{preHandler:requireCsrf},async(req:AuthRequest,reply)=>{
  const parsed=z.object({status:z.enum(['PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','EXPIRED'])}).safeParse(req.body); if(!parsed.success)return reply.code(400).send({error:'Estado inválido'});
  const current=await prisma.payment.findUnique({where:{id:(req.params as any).id},include:{order:true}});if(!current)return reply.code(404).send({error:'Pagamento não encontrado'});
  const p=await prisma.payment.update({where:{id:current.id},data:{status:parsed.data.status,paidAt:parsed.data.status==='PAID'?(current.paidAt||new Date()):current.paidAt,refundedAt:parsed.data.status==='REFUNDED'?new Date():current.refundedAt}});
  if(parsed.data.status==='PAID' && current.order.status==='PENDING')await prisma.order.updateMany({where:{id:current.orderId,status:'PENDING'},data:{status:'CONFIRMED'}});
  await audit(req.userId,'PAYMENT_STATUS_CHANGED','Payment',p.id,{status:p.status,orderId:p.orderId});return p;
});

app.get('/api/orders', { preHandler: requireAdmin }, async (req, reply) => {
  const q = z.object({ q:z.string().trim().max(120).optional(), status:z.enum(['ALL','PENDING','CONFIRMED','DELIVERED','CANCELLED','REJECTED']).default('ALL'), page:z.coerce.number().int().min(1).default(1), pageSize:z.coerce.number().int().min(1).max(100).default(50) }).safeParse(req.query);
  if (!q.success) return reply.code(400).send({error:'Filtros inválidos'});
  const where:any = q.data.status==='ALL'?{}:{status:q.data.status};
  if(q.data.q) where.OR=[{id:{contains:q.data.q,mode:'insensitive'}},{customerName:{contains:q.data.q,mode:'insensitive'}},{customerPhone:{contains:q.data.q,mode:'insensitive'}}];
  const [items,total]=await prisma.$transaction([
    prisma.order.findMany({where,include:{items:true,payments:{orderBy:{createdAt:'desc'},take:1}},orderBy:{createdAt:'desc'},skip:(q.data.page-1)*q.data.pageSize,take:q.data.pageSize}),
    prisma.order.count({where})
  ]);
  return {items,total,page:q.data.page,pageSize:q.data.pageSize,pages:Math.max(1,Math.ceil(total/q.data.pageSize))};
});
app.get('/api/orders/:id', { preHandler: requireAdmin }, async (req: AuthRequest, reply) => { const order = await prisma.order.findUnique({ where: { id: (req.params as any).id }, include: { items: true, payments:{orderBy:{createdAt:'desc'}} } }); if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' }); return order; });
app.patch('/api/orders/:id/status', { preHandler: requireCsrf }, async (req: AuthRequest, reply) => {
  const parsed=z.object({status:z.enum(['PENDING','CONFIRMED','DELIVERED','CANCELLED','REJECTED'])}).safeParse(req.body);
  if(!parsed.success)return reply.code(400).send({error:'Status inválido'});
  try {
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findUnique({where:{id:(req.params as any).id},include:{items:true}});
      if(!order) throw new Error('NOT_FOUND');
      if(order.status === parsed.data.status) return order;
      if (!canTransition(order.status as any, parsed.data.status)) throw new Error('INVALID_TRANSITION');
      const terminal=['CANCELLED','REJECTED'].includes(order.status);
      const nextTerminal=['CANCELLED','REJECTED'].includes(parsed.data.status);
      // Claim the transition atomically. Two admins cancelling/rejecting the same
      // order at the same time must not both restore its stock.
      const claimed = await tx.order.updateMany({
        where:{id:order.id,status:order.status},
        data:{status:parsed.data.status}
      });
      if (claimed.count !== 1) throw new Error('STATUS_CONFLICT');
      if (!terminal && nextTerminal) {
        for (const item of order.items) await tx.productSize.update({where:{productId_size:{productId:item.productId,size:item.size}},data:{stock:{increment:item.quantity}}});
      }
      return tx.order.findUniqueOrThrow({where:{id:order.id},include:{items:true}});
    });
    await audit(req.userId, 'ORDER_STATUS_CHANGED', 'Order', result.id, { status: result.status });
    return result;
  } catch(e:any) {
    if(e?.message==='NOT_FOUND') return reply.code(404).send({error:'Pedido não encontrado'});
    if(e?.message==='INVALID_TRANSITION') return reply.code(409).send({error:'Transição de estado não permitida'});
    if(e?.message==='STATUS_CONFLICT') return reply.code(409).send({error:'O pedido foi alterado por outro administrador. Atualize a lista e tente novamente.'});
    return reply.code(409).send({error:'Não foi possível atualizar o pedido'});
  }
});

app.get('/api/audit', { preHandler: requireAdmin }, async () => {
  return prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id:true, action:true, entity:true, entityId:true, metadata:true, createdAt:true, userId:true } });
});

app.get('/api/settings/public', async()=>{const rows=await prisma.setting.findMany({where:{key:{in:['shopName','currency','whatsapp']}}});return Object.fromEntries(rows.map(x=>[x.key,x.value]));});
app.get('/api/settings', {preHandler:requireAdmin}, async()=>{const rows=await prisma.setting.findMany({where:{key:{notIn:['payment.clicpay.token','payment.clicpay.webhookSecret']}}});return Object.fromEntries(rows.map(x=>[x.key,x.value]));});
app.patch('/api/settings', {preHandler:requireCsrf}, async(req:AuthRequest,reply)=>{const parsed=z.object({shopName:z.string().trim().min(1).max(120).optional(),currency:z.enum(['MT','EUR','USD','BRL','GBP']).optional(),whatsapp:z.string().regex(/^\d{8,15}$/).optional(),deliveryBaseCost:z.number().min(0).max(100000).refine(v=>Number.isInteger(Math.round(v*100)),'Valor inválido').optional(),deliveryPerKm:z.number().min(0).max(100000).refine(v=>Number.isInteger(Math.round(v*100)),'Valor inválido').optional(),deliveryOriginLat:z.number().min(-90).max(90).optional(),deliveryOriginLng:z.number().min(-180).max(180).optional(),deliveryMaxKm:z.number().positive().max(10000).optional()}).strict().safeParse(req.body);if(!parsed.success)return reply.code(400).send({error:'Configuração inválida'});await prisma.$transaction(Object.entries(parsed.data).map(([key,value])=>prisma.setting.upsert({where:{key},create:{key,value:String(value)},update:{value:String(value)}}))); await audit(req.userId, 'SETTINGS_UPDATED', 'Setting', undefined, parsed.data); return {ok:true};});

app.get('/api/settings/payments', {preHandler: requireAdmin}, async()=>{
  const rows=await prisma.setting.findMany({where:{key:{startsWith:'payment.'}}}); const v=Object.fromEntries(rows.map(r=>[r.key,r.value]));
  return {provider:v['payment.provider']||process.env.PAYMENT_PROVIDER||'mock',clicpayBaseUrl:v['payment.clicpay.baseUrl']||process.env.CLICPAY_BASE_URL||'https://clicpay.co.mz',walletId:v['payment.clicpay.walletId']||'',tokenConfigured:Boolean(v['payment.clicpay.token']||process.env.CLICPAY_TOKEN),webhookSecretConfigured:Boolean(v['payment.clicpay.webhookSecret']||process.env.PAYMENT_WEBHOOK_SECRET),mpesaEnabled:v['payment.mpesa.enabled']!=='false',emolaEnabled:v['payment.emola.enabled']!=='false'};
});
app.patch('/api/settings/payments', {preHandler: requireCsrf}, async(req:AuthRequest,reply)=>{
  const parsed=z.object({provider:z.enum(['clicpay','mock']).default('clicpay'),clicpayBaseUrl:z.string().url().max(300).optional(),walletId:z.string().trim().max(100).optional(),token:z.string().trim().max(500).optional(),webhookSecret:z.string().trim().max(500).optional(),mpesaEnabled:z.boolean().optional(),emolaEnabled:z.boolean().optional()}).strict().safeParse(req.body);
  if(!parsed.success)return reply.code(400).send({error:'Configuração de pagamentos inválida'});
  const entries:Array<[string,string]>=[['payment.provider',parsed.data.provider],['payment.clicpay.baseUrl',parsed.data.clicpayBaseUrl||'https://clicpay.co.mz'],['payment.clicpay.walletId',parsed.data.walletId||''],['payment.mpesa.enabled',String(parsed.data.mpesaEnabled!==false)],['payment.emola.enabled',String(parsed.data.emolaEnabled!==false)]];
  if(parsed.data.token)entries.push(['payment.clicpay.token',encryptSecret(parsed.data.token)]); if(parsed.data.webhookSecret)entries.push(['payment.clicpay.webhookSecret',encryptSecret(parsed.data.webhookSecret)]);
  await prisma.$transaction(entries.map(([key,value])=>prisma.setting.upsert({where:{key},create:{key,value},update:{value}}))); await audit(req.userId,'PAYMENT_SETTINGS_UPDATED','Setting',undefined,{provider:parsed.data.provider,walletId:parsed.data.walletId||null,tokenUpdated:Boolean(parsed.data.token),webhookSecretUpdated:Boolean(parsed.data.webhookSecret),mpesaEnabled:parsed.data.mpesaEnabled!==false,emolaEnabled:parsed.data.emolaEnabled!==false}); return {ok:true};
});

app.get('/api/dashboard/summary',{preHandler:requireAdmin},async()=>{const orders=await prisma.order.findMany({select:{status:true,currency:true,total:true,createdAt:true}});const products=await prisma.product.count({where:{active:true}});const today=new Date();today.setHours(0,0,0,0);const valid=orders.filter(o=>!['CANCELLED','REJECTED'].includes(o.status));return {ordersCount:valid.length,productsCount:products,salesToday:valid.filter(o=>o.createdAt>=today).length,revenueByCurrency:Object.fromEntries(['MT','EUR','USD','BRL','GBP'].map(c=>[c,valid.filter(o=>o.currency===c).reduce((s,o)=>s+parseMoneyCents(o.total.toString()),0)/100]))};});

export { app, prisma };

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting_down');
    try { await app.close(); } finally { await prisma.$disconnect(); }
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  app.listen({ port: PORT, host: '0.0.0.0' }).catch(err => {
    app.log.error(err, 'startup_failed');
    process.exit(1);
  });
}
