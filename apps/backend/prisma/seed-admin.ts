import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN, deletedAt: null } });
  if (existingAdmin) {
    console.log(`Administrador existente detectado (${existingAdmin.email}); no se modificaron sus credenciales.`);
    return;
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim();
  if (!email || !password || !name) throw new Error('No existe un administrador. Define ADMIN_EMAIL, ADMIN_PASSWORD y ADMIN_NAME antes de ejecutar prisma:seed.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) throw new Error('ADMIN_EMAIL ya pertenece a un usuario. Promueve la cuenta desde una sesion administrativa existente.');
  await prisma.user.create({ data: { email, name, role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 12), profiles: { create: { name } } } });
  console.log(`Administrador ${email} creado correctamente.`);
}

main().finally(() => prisma.$disconnect()).catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
