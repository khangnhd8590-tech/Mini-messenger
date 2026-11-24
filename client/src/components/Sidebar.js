'use client';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useStore } from '@/store/useStore';
import Avatar from './Avatar';
import Logo from './Logo';

export default function Sidebar() {
  const me = useStore((s) => s.me);
  const unread = useStore((s) => s.conversations.reduce((n, c) => n + c.unread, 0));
  const { dark, toggle } = useTheme();

  const logout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };
  const btn = 'grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800';

  return (
    <nav className="hidden w-16 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-slate-50 py-4 transition-colors md:flex dark:border-slate-800 dark:bg-slate-950">
      <div className="relative" title="POP">
        <Logo size={40} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>
      <div className="flex-1" />
      <button onClick={toggle} className={btn} title={dark ? 'Chế độ sáng' : 'Chế độ tối'}>
        {dark ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <button onClick={logout} className={btn} title="Đăng xuất"><LogOut size={20} /></button>
      <div title={me?.username} className="mt-1"><Avatar name={me?.username} size={36} /></div>
    </nav>
  );
}
