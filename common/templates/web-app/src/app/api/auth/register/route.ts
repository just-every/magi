import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import * as z from 'zod';

const schema = z.object({
    email: z.string().email(),
    name: z.string().nonempty(),
    password: z.string().min(6),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const response = schema.safeParse(body);
        if (!response.success) {
            const { errors } = response.error;

            return NextResponse.json(
                { success: false, message: 'Invalid request', errors },
                { status: 400 }
            );
        }

        const { email, name, password } = body;

        const userExists = await prisma.user.findFirst({ where: { email } });
        if (userExists) {
            throw new Error('A user with the same email already exists!');
        }

        await prisma.user.create({
            data: { email, name, password },
        })
    } catch (e) {
        console.log({ e });

        return NextResponse.json(
            { success: false, message: e.message },
            { status: 422 }
        );
    }

    return NextResponse.json(
        { success: true, message: 'User signed up successfully' },
        { status: 201 }
    );
}

