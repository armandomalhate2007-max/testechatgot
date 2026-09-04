import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password || password.length < 12) {
  console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) no .env.');
  process.exit(1);
}

const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
const user = await prisma.user.upsert({
  where: { email },
  create: { email, passwordHash, role: 'ADMIN' },
  update: { passwordHash }
});
console.log(`Administrador preparado: ${user.email}`);
await prisma.$disconnect();
