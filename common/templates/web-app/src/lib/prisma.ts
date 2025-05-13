import { PrismaClient } from '@/generated/prisma'
import bcrypt from 'bcryptjs';

const globalForPrisma = global as unknown as {
    prisma: PrismaClient
}

const prisma = globalForPrisma.prisma || new PrismaClient({
    omit: {
        user: {
            password: true,
        },
    },
}).$extends({
    query: {
        user: {
            $allOperations({ operation, args, query }) {
                if (['create', 'update'].includes(operation) && args.data['password']) {
                    args.data['password'] = bcrypt.hashSync(args.data['password'], 10)
                }

                return query(args)
            }
        }
    }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
