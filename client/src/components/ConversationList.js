'use client';
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { keyOf, openConversation } from '@/store/chat';
import { fmtListTime, previewOf } from '@/lib/format';
import Avatar from './Avatar';

export default function ConversationList({ onNewGroup }) {
  const conversations = useStore((s) => s.conversations);
  const active = useStore((s) => s.active);
  const typing = useStore((s) => s.typing);
  const me = useStore((s) => s.me);
  const [q, setQ] = useState('');

  const list = useMemo(
    () => conversations
      .filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => (b.last_at ? +new Date(b.last_at) : 0) - (a.last_at ? +new Date(a.last_at) : 0) || a.name.localeCompare(b.name)),
    [conversations, q]);

  return (
    <section className={`${active ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-slate-200 transition-colors md:w-80 dark:border-slate-800`}>
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-xl font-bold">Đoạn chat</h2>
        <button onClick={onNewGroup} title="Tạo nhóm mới"
          className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
          <Plus size={20} />
        </button>
      </div>

      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 dark:bg-slate-800">
          <Search size={16} className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.map((c) => {
          const isActive = active && active.kind === c.kind && active.id === c.id;
          const isTyping = typing[keyOf(c)];
          const prefix = c.last_sender_id === me.id ? 'Bạn: ' : c.kind === 'group' && c.last_sender_name ? `${c.last_sender_name}: ` : '';
          const preview = isTyping ? 'đang soạn tin...' : c.last_at ? prefix + previewOf(c) : 'Chưa có tin nhắn';
          return (
            <li key={keyOf(c)}>
              <button onClick={() => openConversation(c)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-brand-50 dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}>
                <Avatar name={c.name} size={48} group={c.kind === 'group'} online={c.status === 'online'} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtListTime(c.last_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${isTyping ? 'text-brand-500' : c.unread ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-500'}`}>
                      {preview}
                    </span>
                    {c.unread > 0 && (
                      <span className="min-w-5 shrink-0 rounded-full bg-brand-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">
                        {c.unread > 99 ? '99+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-slate-400">Không có kết quả</li>}
      </ul>
    </section>
  );
}
