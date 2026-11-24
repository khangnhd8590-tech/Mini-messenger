'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { loadConversations, openConversation, refreshGroup } from '@/store/chat';
import Avatar from './Avatar';

// mode = 'create': tạo nhóm mới | mode = 'add': thêm thành viên vào nhóm đang mở
export default function GroupModal({ mode, onClose }) {
  const conversations = useStore((s) => s.conversations);
  const group = useStore((s) => s.group);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const existing = new Set((group?.members || []).map((m) => m.id));
  const users = conversations.filter((c) => c.kind === 'dm' && (mode === 'create' || !existing.has(c.id)));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    setBusy(true); setError('');
    try {
      const g = await api('/groups', { method: 'POST', body: { name, memberIds: selected } });
      await loadConversations();
      onClose();
      openConversation({ kind: 'group', id: g.id });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const add = async (userId) => {
    setError('');
    try {
      await api(`/groups/${group.id}/members`, { method: 'POST', body: { userId } });
      await refreshGroup();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{mode === 'create' ? 'Tạo nhóm mới' : 'Thêm thành viên'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {mode === 'create' && (
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm" autoFocus
            className="mb-3 w-full rounded-xl border border-slate-300 bg-transparent px-4 py-2.5 outline-none focus:border-brand-500 dark:border-slate-600" />
        )}

        <ul className="max-h-72 overflow-y-auto">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
              <Avatar name={u.name} size={36} online={u.status === 'online'} />
              <span className="flex-1 truncate">{u.name}</span>
              {mode === 'create' ? (
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
              ) : (
                <button onClick={() => add(u.id)} className="rounded-full bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-500">Thêm</button>
              )}
            </li>
          ))}
          {users.length === 0 && <li className="py-6 text-center text-sm text-slate-400">Không còn ai để thêm</li>}
        </ul>

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        {mode === 'create' && (
          <button onClick={create} disabled={busy || !name.trim()}
            className="mt-4 w-full rounded-xl bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-500 disabled:opacity-50">
            {busy ? 'Đang tạo...' : `Tạo nhóm (${selected.length + 1} thành viên)`}
          </button>
        )}
      </div>
    </div>
  );
}
