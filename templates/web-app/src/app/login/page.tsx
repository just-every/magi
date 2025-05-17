import { getServerSession } from 'next-auth';
import { authOptions } from '../api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import LoginForm from './form';

export default async function LoginPage() {
    const session = await getServerSession(authOptions);
    if (!!session) {
        redirect('/');
    }

    return (
        <section className="h-screen flex items-center justify-center">
            <div className="w-[600px]">
                <LoginForm />
            </div>
        </section>
    );
}
