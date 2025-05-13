import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const authOptions = {
    // Configure one or more authentication providers
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: {},
                password: {},
            },
            async authorize(credentials, req) {
                if (credentials === undefined || !credentials.email || !credentials.password) {
                    return null;
                }

                const user = await prisma.user.findFirst({
                    where: { email: credentials.email },
                    omit: { password: false }
                });

                console.log('USER', user);

                if (user === null || !bcrypt.compareSync(credentials.password, user.password)) {
                    return null;
                }

                return user;
            }
        })
    ],
    pages: {
        signIn: '/login',
    },
    session: {
        strategy: 'jwt',
    },
    secret: process.env.AUTH_SECRET,
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
