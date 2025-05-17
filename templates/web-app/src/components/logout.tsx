'use client';

import { signOut } from 'next-auth/react';

const Logout = () => {
    return (
        <button
            className="text-white hover:underline"
            onClick={() => signOut({ callbackUrl: '/' })}
            aria-label="Logout"
        >
            Logout
        </button>
    );
};

export default Logout;
