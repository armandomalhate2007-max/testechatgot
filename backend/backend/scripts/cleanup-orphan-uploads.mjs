import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
const products = await prisma.product.findMany({ select: { imageUrl: true } });
const referenced = new Set(products.map(p => p.imageUrl).filter(x => typeof x === 'string' && x.startsWith('/uploads/')).map(x => path.basename(x)));
for (const file of await readdir(dir).catch(() => [])) {
  if (!referenced.has(file)) await unlink(path.join(dir, file)).catch(() => undefined);
}
await prisma.$disconnect();
