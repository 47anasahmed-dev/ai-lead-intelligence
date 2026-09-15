import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEMO_USER_EMAIL ?? 'demo@saasquatch.local';
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: 'Demo User' },
    create: { email, name: 'Demo User' },
  });
  console.log(`Seeded demo user: ${user.email} (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
