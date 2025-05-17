import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import Logout from './logout';

export default async function Header() {
  const session = await getServerSession(authOptions);

  return (
    <header>
      <nav className="bg-primary h-12 text-white flex items-center p-4">
        <div className="container mx-auto flex justify-between">
          <div className="flex gap-x-4 items-center">
            <Link href="/" className="font-semibold text-lg">
              NextJS App
            </Link>
          </div>
          <div className="flex gap-x-4 items-center">
            {!!session && (
              <>
                <span className="text-sm opacity-75">
                  Hello, {session.user?.name}
                </span>
                <Logout />
              </>
            )}
            {!session && (
              <>
                <Link href="/login" className="hover:underline">
                  Login
                </Link>
                <Link href="/register" className="hover:underline">
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}
