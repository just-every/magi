import { getServerSession } from 'next-auth';
import { authOptions } from './api/auth/[...nextauth]/route';
import Link from 'next/link';

export default async function Home() {
    const session = await getServerSession(authOptions);

    return (
        <div className="container mx-auto px-4 py-16">
            <div className="max-w-3xl mx-auto">
                <main className="flex flex-col gap-8">
                    <h1 className="text-4xl font-bold">Next.js Full-Stack Template</h1>

                    <div className="prose prose-lg">
                        <p className="text-xl">
                            {session ? (
                                <>Welcome back, <strong>{session.user?.name}</strong>!</>
                            ) : (
                                <>Welcome to your Next.js application</>
                            )}
                        </p>

                        <div className="my-8 p-6 bg-primary/5 rounded-xl border border-primary/10">
                            <h2 className="text-2xl font-semibold mb-4">Getting Started</h2>
                            <p>This template includes:</p>
                            <ul className="mt-2 space-y-2">
                                <li>Authentication with NextAuth.js and JWT</li>
                                <li>Database integration with Prisma</li>
                                <li>UI components with Radix UI and Tailwind CSS</li>
                                <li>Form handling with React Hook Form and Zod</li>
                            </ul>
                        </div>

                        {!session && (
                            <div className="flex flex-col sm:flex-row gap-4 mt-8">
                                <Link
                                    href="/register"
                                    className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 text-center"
                                >
                                    Create Account
                                </Link>
                                <Link
                                    href="/login"
                                    className="px-6 py-3 bg-secondary text-white font-medium rounded-lg hover:bg-secondary/90 text-center"
                                >
                                    Sign In
                                </Link>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
