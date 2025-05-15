import { Prisma } from '@/generated/prisma'
import prisma from '@/lib/prisma';

const userData: Prisma.UserCreateInput[] = [
    {
        name: 'Test',
        email: 'test@user.com',
        password: 'admin123',
    }
]

export async function main() {
    for (const u of userData) {
        await prisma.user.create({ data: u })
    }
}

main()
