'use client';
import { useState } from 'react';
import { Download, FileText, MoreHorizontal, Pin, PinOff, Reply, Trash2, Undo2 } from 'lucide-react';
import Avatar from './Avatar';
import { fileUrl } from '@/lib/api';
import { fmtFull, fmtSize, fmtTime, previewOf } from '@/lib/format';
import { deleteForMe, jumpTo, recallMessage, togglePin, toggleReaction } from '@/store/chat';
import { useStore } from '@/store/useStore';

export const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡'];

// Tự nhận diện link và @mention trong nội dung
function renderText(text, myName) {
  return text.split(/(https?:\/\/[^\s]+|@\w+)/g).map((part, i) => {
    if (/^https?:\/\//.test(part))
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all underline">{part}</a>;
    if (/^@\w+$/.test(part)) {
      const isMe = part.slice(1).toLowerCase() === myName.toLowerCase();
      return (
        <span key={i} className={`font-semibold ${isMe ? 'rounded bg-amber-300 px-1 text-slate-900' : ''}`}>{part}</span>
      );
    }
    return part;
  });
}

export default function MessageBubble({ m, mine, isFirst, isLast, isGroup, status, onMediaLoad }) {
  const me = useStore((s) => s.me);
  const isReplyTarget = useStore((s) => s.replyTo?.id === m.id);
  const [zoom, setZoom] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const recalled = !!m.recalled_at;
  const isMedia = !recalled && (m.type === 'image' || m.type === 'video');
  const mentionedMe = !recalled && m.mentions.includes(me.id);

  // Gom nhóm: bo góc mềm khi cùng người gửi nhiều tin liên tiếp
  const radius = mine
    ? `rounded-2xl ${isFirst ? '' : 'rounded-tr-md'} ${isLast ? '' : 'rounded-br-md'}`
    : `rounded-2xl ${isFirst ? '' : 'rounded-tl-md'} ${isLast ? '' : 'rounded-bl-md'}`;
  const color = mine ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700';

  const reactionGroups = Object.entries(
    m.reactions.reduce((acc, r) => { (acc[r.emoji] ||= []).push(r.user_id); return acc; }, {}));

  const iconBtn = 'grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700';
  const menuItem = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700';

  // Tên tác giả của tin ĐƯỢC TRÍCH DẪN (không phải người đang trả lời)
  const quoteAuthor = m.reply_to && (m.reply_to.sender_id === me.id ? 'Bạn' : m.reply_to.sender_name);

  return (
    <div id={`msg-${m.id}`}
      className={`flex items-end gap-2 rounded-lg px-4 transition-colors ${mine ? 'flex-row-reverse' : ''} ${isFirst ? 'mt-3' : 'mt-0.5'} ${isReplyTarget ? 'bg-brand-500/10' : ''}`}>
      {/* Avatar chỉ hiện ở tin cuối của cụm, các tin còn lại chừa chỗ trống */}
      {!mine && <div className="w-8 shrink-0">{isLast && <Avatar name={m.sender_name} size={32} />}</div>}

      <div className={`group relative flex max-w-[75%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && isGroup && isFirst && <span className="mb-0.5 px-3 text-xs text-slate-500">{m.sender_name}</span>}
        {m.is_pinned && !recalled && (
          <span className="mb-0.5 flex items-center gap-1 px-2 text-[11px] text-slate-400"><Pin size={11} /> Đã ghim</span>
        )}

        {/* Quick Reaction Bar + hành động, hiện khi hover (giữ nguyên khi đang mở menu) */}
        {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
        <div className={`absolute bottom-full z-40 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg transition dark:border-slate-600 dark:bg-slate-800 ${mine ? 'right-0' : 'left-0'} ${menuOpen ? 'visible opacity-100' : 'invisible opacity-0 group-hover:visible group-hover:opacity-100'}`}>
          {!recalled && (
            <>
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => toggleReaction(m.id, e)}
                  className="grid h-7 w-7 place-items-center rounded-full text-lg transition-transform hover:scale-125">{e}</button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-slate-600" />
              {/* Chọn tin khác để trả lời sẽ GHI ĐÈ tin đang được chọn */}
              <button title="Trả lời" className={iconBtn} onClick={() => useStore.setState({ replyTo: m })}><Reply size={16} /></button>
              <button title={m.is_pinned ? 'Bỏ ghim' : 'Ghim'} className={iconBtn} onClick={() => togglePin(m.id)}>
                {m.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
            </>
          )}
          <button title="Thêm" className={iconBtn} onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal size={16} /></button>

          {menuOpen && (
            <div className={`absolute top-full mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-800 ${mine ? 'right-0' : 'left-0'}`}>
              {mine && !recalled && (
                <button className={menuItem} onClick={() => { setMenuOpen(false); recallMessage(m.id); }}>
                  <Undo2 size={16} /> Thu hồi với mọi người
                </button>
              )}
              <button className={`${menuItem} text-red-500`} onClick={() => { setMenuOpen(false); deleteForMe(m.id); }}>
                <Trash2 size={16} /> Xóa ở phía tôi
              </button>
            </div>
          )}
        </div>

        {/* Khung trích dẫn: hiện TIN CŨ được trả lời (tên tác giả gốc + nội dung gốc) */}
        {m.reply_to && !recalled && (
          <button onClick={() => jumpTo(m.reply_to.id)}
            className="mb-0.5 w-full max-w-full rounded-xl border-l-4 border-brand-400 bg-slate-200/70 px-3 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            <div className="font-semibold text-brand-600 dark:text-brand-300">{quoteAuthor}</div>
            <div className={`line-clamp-2 break-words ${m.reply_to.recalled_at ? 'italic opacity-70' : ''}`}>{previewOf(m.reply_to)}</div>
          </button>
        )}

        {/* Nội dung */}
        {recalled ? (
          <div className={`border border-dashed border-slate-300 px-3 py-2 text-sm italic text-slate-400 dark:border-slate-600 ${radius}`}>
            {mine ? 'Bạn đã thu hồi một tin nhắn' : `${m.sender_name} đã thu hồi một tin nhắn`}
          </div>
        ) : (
          <div title={fmtFull(m.created_at)}
            className={isMedia ? `${mentionedMe ? 'ring-2 ring-amber-400' : ''} overflow-hidden ${radius}` : `px-3 py-2 ${color} ${radius} ${mentionedMe ? 'ring-2 ring-amber-400' : ''}`}>
            {m.type === 'text' && <p className="whitespace-pre-wrap break-words">{renderText(m.content, me.username)}</p>}

            {m.type === 'image' && (
              <img src={fileUrl(m.id)} alt={m.file_name} onLoad={onMediaLoad} onClick={() => setZoom(true)}
                className="max-h-72 max-w-full cursor-zoom-in object-cover" />
            )}

            {m.type === 'video' && (
              <video src={fileUrl(m.id)} controls preload="metadata" onLoadedMetadata={onMediaLoad}
                className="max-h-72 max-w-full bg-black" />
            )}

            {m.type === 'file' && (
              <div className="flex w-64 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/10"><FileText size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.file_name}</div>
                  <div className="text-xs opacity-70">{fmtSize(m.file_size)}</div>
                </div>
                <a href={fileUrl(m.id, true)} title="Tải xuống"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/10 hover:bg-black/20"><Download size={18} /></a>
              </div>
            )}
          </div>
        )}

        {/* Reactions hiển thị đè nhẹ lên mép bong bóng */}
        {!recalled && reactionGroups.length > 0 && (
          <div className="z-10 -mt-1.5 flex gap-1 px-2">
            {reactionGroups.map(([emoji, ids]) => (
              <button key={emoji} onClick={() => toggleReaction(m.id, emoji)}
                className={`flex items-center gap-0.5 rounded-full border bg-white px-1.5 text-xs shadow-sm dark:bg-slate-800 ${ids.includes(me.id) ? 'border-brand-400' : 'border-slate-200 dark:border-slate-600'}`}>
                {emoji}{ids.length > 1 && <span>{ids.length}</span>}
              </button>
            ))}
          </div>
        )}

        {isLast && (
          <div className="mt-0.5 px-1 text-[11px] text-slate-400">
            {fmtTime(m.created_at)}{status && ` · ${status}`}
          </div>
        )}
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/85 p-4" onClick={() => setZoom(false)}>
          <img src={fileUrl(m.id)} alt={m.file_name} className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
