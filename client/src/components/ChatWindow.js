'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, Loader2, Pin, Search, UserPlus, X } from 'lucide-react';
import { formatDistanceToNow, isSameDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { api } from '@/lib/api';
import { fmtDay, fmtTime, previewOf } from '@/lib/format';
import { useAutoScroll } from '@/hooks/useAutoScroll';
import { useStore } from '@/store/useStore';
import { backToLatest, closeConversation, jumpTo, keyOf, loadOlder, togglePin } from '@/store/chat';
import Avatar from './Avatar';
import GroupModal from './GroupModal';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import OutboxItem from './OutboxItem';

const within5 = (a, b) => new Date(b.created_at) - new Date(a.created_at) < 5 * 60 * 1000;

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      <i className="typing-dot" /><i className="typing-dot" /><i className="typing-dot" />
    </span>
  );
}

/* ------------------------- Thanh tin nhắn đã ghim ------------------------- */
function PinnedBar({ pinned }) {
  const [i, setI] = useState(0);
  if (!pinned.length) return null;
  const p = pinned[i % pinned.length];
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm dark:border-slate-800 dark:bg-slate-950">
      <Pin size={16} className="shrink-0 text-brand-500" />
      <button className="min-w-0 flex-1 text-left" onClick={() => { jumpTo(p.id); setI(i + 1); }}>
        <div className="text-xs font-medium text-brand-500">
          Tin nhắn đã ghim {pinned.length > 1 && `(${(i % pinned.length) + 1}/${pinned.length})`}
        </div>
        <div className="truncate text-slate-600 dark:text-slate-300">{p.sender_name}: {previewOf(p)}</div>
      </button>
      <button title="Bỏ ghim" onClick={() => togglePin(p.id)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
    </div>
  );
}

/* ------------------------- Tìm kiếm trong cuộc trò chuyện ------------------------- */
function Highlight({ text, q }) {
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.split(re).map((part, i) =>
    i % 2 ? <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">{part}</mark> : part);
}

function SearchPanel({ active, onClose }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setRows([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try { setRows(await api(`/messages/search?kind=${active.kind}&id=${active.id}&q=${encodeURIComponent(term)}`)); }
      catch { setRows([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, active]);

  return (
    <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 px-4 py-2">
        <Search size={16} className="text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm trong cuộc trò chuyện"
          className="flex-1 bg-transparent text-sm outline-none" />
        {loading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
      </div>
      {q.trim() && (
        <ul className="max-h-64 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
          {rows.map((m) => (
            <li key={m.id}>
              <button onClick={() => jumpTo(m.id)} className="w-full px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{m.sender_name}</span><span>{fmtDay(m.created_at)} {fmtTime(m.created_at)}</span>
                </div>
                <div className="line-clamp-2 text-sm"><Highlight text={m.content} q={q.trim()} /></div>
              </button>
            </li>
          ))}
          {!loading && rows.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">Không tìm thấy tin nhắn nào</li>}
        </ul>
      )}
    </div>
  );
}

/* ------------------------- Khung chat chính (cột 3) ------------------------- */
export default function ChatWindow() {
  const s = useStore();
  const { active, me, messages, group, pinned, typing, searchOpen, detached, hasMore, uploading } = s;
  const conv = s.conversations.find((c) => c.kind === active.kind && c.id === active.id);
  const isGroup = active.kind === 'group';
  const [adding, setAdding] = useState(false);

  const listRef = useRef(null);
  const { onScroll, onMediaLoad, scrollToBottom, away, newCount } =
    useAutoScroll(listRef, messages, keyOf(active), me.id);

  // Tin/tệp đang gửi của cuộc trò chuyện này
  const outboxHere = s.outbox.filter((o) => o.kind === active.kind && o.convId === active.id);
  const prevOutbox = useRef(0);
  useEffect(() => {
    if (outboxHere.length > prevOutbox.current) scrollToBottom(false);
    prevOutbox.current = outboxHere.length;
  }, [outboxHere.length, scrollToBottom]);

  const handleScroll = () => {
    onScroll();
    if (listRef.current.scrollTop < 80) loadOlder();
  };

  const goBottom = async () => {
    if (detached) {
      await backToLatest();
      requestAnimationFrame(() => scrollToBottom(false));
    } else scrollToBottom(true);
  };

  const subtitle = isGroup
    ? `${group?.members.length ?? '…'} thành viên`
    : conv?.status === 'online'
      ? 'Đang hoạt động'
      : conv?.last_seen
        ? `Hoạt động ${formatDistanceToNow(new Date(conv.last_seen), { addSuffix: true, locale: vi })}`
        : 'Ngoại tuyến';

  const typingInfo = typing[keyOf(active)];
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === me.id)?.id;

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button onClick={closeConversation} className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 md:hidden dark:hover:bg-slate-800">
          <ArrowLeft size={20} />
        </button>
        <Avatar name={conv?.name} size={42} group={isGroup} online={conv?.status === 'online'} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{conv?.name}</div>
          <div className="truncate text-xs text-slate-500">{subtitle}</div>
        </div>
        <button title="Tìm kiếm" onClick={() => useStore.setState({ searchOpen: !searchOpen })}
          className={`grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 ${searchOpen ? 'text-brand-500' : ''}`}>
          <Search size={20} />
        </button>
        {isGroup && (
          <button title="Thêm thành viên" onClick={() => setAdding(true)}
            className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <UserPlus size={20} />
          </button>
        )}
      </header>

      {searchOpen && <SearchPanel active={active} onClose={() => useStore.setState({ searchOpen: false })} />}
      <PinnedBar pinned={pinned} />

      {/* Stream tin nhắn */}
      <div className="relative min-h-0 flex-1">
        <div ref={listRef} onScroll={handleScroll} className="h-full overflow-y-auto py-4">
          {messages.length === 0 && hasMore && <div className="py-10 text-center text-sm text-slate-400">Đang tải...</div>}
          {!hasMore && <div className="py-6 text-center text-xs text-slate-400">
            {messages.length ? 'Đây là đầu cuộc trò chuyện' : 'Chưa có tin nhắn nào. Hãy gửi lời chào 👋'}
          </div>}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at));
            const sameAsPrev = prev && !newDay && prev.sender_id === m.sender_id && within5(prev, m);
            const sameAsNext = next && next.sender_id === m.sender_id && within5(m, next)
              && isSameDay(new Date(m.created_at), new Date(next.created_at));
            const mine = m.sender_id === me.id;
            const status = !isGroup && mine && m.id === lastMineId
              ? (m.is_read ? 'Đã xem' : m.delivered_at ? 'Đã nhận' : 'Đã gửi') : null;
            return (
              <Fragment key={m.id}>
                {newDay && <div className="my-3 text-center text-xs text-slate-400">{fmtDay(m.created_at)}</div>}
                <MessageBubble m={m} mine={mine} isGroup={isGroup} status={status}
                  isFirst={!sameAsPrev} isLast={!sameAsNext} onMediaLoad={onMediaLoad} />
              </Fragment>
            );
          })}

          {outboxHere.map((o) => <OutboxItem key={o.id} o={o} />)}
        </div>

        {/* Nút nổi: có tin mới / về tin mới nhất */}
        {(away || detached) && (
          <button onClick={goBottom}
            className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full shadow-lg ${
              newCount > 0 || detached
                ? 'bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500'
                : 'h-10 w-10 justify-center border border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'}`}>
            {detached ? 'Về tin nhắn mới nhất' : newCount > 0 ? 'Có tin nhắn mới' : null}
            <ArrowDown size={18} />
          </button>
        )}
      </div>

      {/* Typing / upload indicator (giữ chiều cao cố định để không giật layout) */}
      <div className="h-6 px-5 text-xs text-slate-500">
        {uploading > 0 ? (
          <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Đang tải tệp lên...</span>
        ) : typingInfo ? (
          <span>{isGroup && `${typingInfo.name} `}đang soạn tin <TypingDots /></span>
        ) : null}
      </div>

      <MessageInput />
      {adding && <GroupModal mode="add" onClose={() => setAdding(false)} />}
    </>
  );
}
