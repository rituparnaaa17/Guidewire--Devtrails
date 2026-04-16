import { PrismaClient } from '@prisma/client';

// Singleton pattern — prevent multiple Prisma instances during hot-reload
const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export const testConnection = async () => {
  await prisma.$connect();
  console.log('✅ PostgreSQL (Prisma) connected successfully');
};

export default prisma;
