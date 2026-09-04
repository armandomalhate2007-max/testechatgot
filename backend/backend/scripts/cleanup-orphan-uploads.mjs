import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const products = await prisma.product.findMany({ select: { imageUrl: true, images: true } });
const urls = products.flatMap(p => [p.imageUrl, ...(Array.isArray(p.images) ? p.images : [])]);
const referenced = new Set(urls.filter(x => typeof x === 'string' && x.startsWith('/uploads/')).map(x => path.basename(x)));
for (const file of await readdir(dir).catch(() => [])) {
  if (!referenced.has(file)) await unlink(path.join(dir, file)).catch(() => undefined);
}
await prisma.$disconnect();
