import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const userData = [
    {
        name: 'Test User',
        email: 'test@example.com',
        password: bcrypt.hashSync('password123', 10),
    }
];

async function main() {
    console.log(`Start seeding...`);

    for (const u of userData) {
        const user = await prisma.user.create({
            data: u
        });
        console.log(`Created user with id: ${user.id}`);
    }

    console.log(`Seeding finished.`);
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
