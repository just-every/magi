'use client'

import {useEffect, useState} from "react";

export default function Home() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data.data))
      .catch(e => console.log('[fetch error]', e));
  }, []);

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1>Hello world!</h1>
          <ul>
            {users.map((user, index) => (
              <li key={index} className="text-center sm:text-left">
                {user.name} - {user.email}
              </li>
            ))}
          </ul>
      </main>
    </div>
  );
}
