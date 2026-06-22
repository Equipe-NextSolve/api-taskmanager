import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 1. Criamos a configuração do adaptador passando a URL do .env dinamicamente
const adapter = new PrismaPg({ 
  connectionString: process.env.DATABASE_URL! 
});

// 2. Passamos o adaptador de forma limpa para o PrismaClient
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;