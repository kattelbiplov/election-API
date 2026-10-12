import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse a single PrismaClient across module reloads (tsx watch) to avoid
// exhausting the Postgres connection pool in development.
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error', 'warn'] : ['warn', 'error'],
  });

if (!env.isProduction) {
  global.__prisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
