import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient().$extends({
    query: {
      user: {
        // Automatically hash passwords on create/update operations
        async $allOperations({ operation, args, query }) {
          if (['create', 'update'].includes(operation) && args.data?.password) {
            args.data.password = await bcrypt.hash(args.data.password, 10);
          }
          return query(args);
        },
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
