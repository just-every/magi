import prisma from '@/lib/prisma';

export async function GET(){
    const users = await prisma.user.findMany()

    return new Response(JSON.stringify({ data: users }),{
        status:200,
        headers:{ "Content-Type": "application/json" }
    })
}
