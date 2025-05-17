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
                    where: { email: credentials.email }
                    // Removed unnecessary omit - Prisma includes all fields by default
                });

                if (user === null || !bcrypt.compareSync(credentials.password, user.password)) {
                    return null;
                }

                return user;
            }
        })
    ],
    callbacks: {
        async jwt({ token, user }) {
            // Persist user id, name, and email to the token
            if (user) {
                token.id = user.id;
                token.name = user.name;
                token.email = user.email;
            }
            return token;
        },
        async session({ session, token }) {
            // Add user id, name, and email from token to session
            if (session.user) {
                session.user.id = token.id;
                session.user.name = token.name;
                session.user.email = token.email;
            }
            return session;
        },
    },
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
