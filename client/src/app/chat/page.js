'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { useStore } from '@/store/useStore';
import ChatApp from '@/components/ChatApp';

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    api('/auth/me')
      .then(({ user }) => { useStore.setState({ me: user }); setReady(true); })
      .catch(() => { localStorage.removeItem('token'); router.replace('/login'); });
  }, [router]);

  if (!ready) return <div className="grid h-screen place-items-center text-slate-500">Đang tải...</div>;
  return <ChatApp />;
}
