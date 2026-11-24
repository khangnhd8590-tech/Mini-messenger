'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Logo from './Logo';

export default function AuthForm({ mode }) {
  const router = useRouter();
  const isLogin = mode === 'login';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: { username, password } });
      localStorage.setItem('token', data.token);
      router.replace('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800';

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-4 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center gap-3">
          <Logo size={48} />
          <div>
            <h1 className="text-xl font-semibold">{isLogin ? 'Đăng nhập vào POP' : 'Tạo tài khoản POP'}</h1>
            <p className="text-sm text-slate-500">Nhắn tin nhanh, ngay trên máy bạn</p>
          </div>
        </div>

        <input className={input} placeholder="Tên đăng nhập" autoComplete="username" value={username}
          onChange={(e) => setUsername(e.target.value)} required />
        <input className={input} type="password" placeholder="Mật khẩu" value={password}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)} required />

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <button disabled={busy} className="w-full rounded-xl bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-60">
          {busy ? 'Đang xử lý...' : isLogin ? 'Đăng nhập' : 'Đăng ký'}
        </button>

        <p className="text-center text-sm text-slate-500">
          {isLogin ? 'Chưa có tài khoản? ' : 'Đã có tài khoản? '}
          <Link className="font-medium text-brand-600 hover:underline dark:text-brand-400" href={isLogin ? '/register' : '/login'}>
            {isLogin ? 'Đăng ký' : 'Đăng nhập'}
          </Link>
        </p>
      </form>
    </main>
  );
}
