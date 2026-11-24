'use client';
import { useEffect, useRef, useState } from 'react';
import { Paperclip, Send, Smile, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { emitTyping, markRead, sendFile, sendText } from '@/store/chat';
import { previewOf } from '@/lib/format';
import EmojiPicker from './EmojiPicker';

export default function MessageInput() {
  const active = useStore((s) => s.active);
  const group = useStore((s) => s.group);
  const replyTo = useStore((s) => s.replyTo);
  const me = useStore((s) => s.me);

  const [text, setText] = useState('');
  const [mention, setMention] = useState(null); // { query, start }
  const [mi, setMi] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ta = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { ta.current?.focus(); }, [replyTo]);

  // Gợi ý @mention (chỉ trong nhóm)
  const candidates =
    mention && active.kind === 'group' && group
      ? group.members.filter((u) => u.id !== me.id && u.username.toLowerCase().startsWith(mention.query.toLowerCase())).slice(0, 6)
      : [];
  const idx = Math.min(mi, Math.max(candidates.length - 1, 0));

  const resize = () => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const onChange = (e) => {
    const v = e.target.value;
    setText(v);
    resize();
    if (v.trim()) emitTyping();
    const before = v.slice(0, e.target.selectionStart);
    const m = before.match(/(^|\s)@(\w*)$/);
    setMention(m ? { query: m[2], start: before.length - m[2].length - 1 } : null);
    setMi(0);
  };

  const pick = (u) => {
    const el = ta.current;
    const next = `${text.slice(0, mention.start)}@${u.username} ${text.slice(el.selectionStart)}`;
    const pos = mention.start + u.username.length + 2;
    setText(next);
    setMention(null);
    setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); resize(); }, 0);
  };

  // Chèn emoji tại vị trí con trỏ (bộ chọn vẫn mở để chọn nhiều emoji liên tiếp)
  const insertEmoji = (emoji) => {
    const el = ta.current;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const pos = s + emoji.length;
    setText(text.slice(0, s) + emoji + text.slice(e));
    emitTyping();
    setTimeout(() => { el.focus(); el.setSelectionRange(pos, pos); resize(); }, 0);
  };

  const send = () => {
    const v = text.trim();
    if (!v) return;
    sendText(v, replyTo?.id);
    setText('');
    setMention(null);
    setEmojiOpen(false);
    useStore.setState({ replyTo: null });
    requestAnimationFrame(resize);
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return; // đang gõ tiếng Việt (Telex/VNI) -> không gửi
    if (candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMi((idx + 1) % candidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMi((idx - 1 + candidates.length) % candidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(candidates[idx]); return; }
      if (e.key === 'Escape') { setMention(null); return; }
    }
    if (e.key === 'Escape' && replyTo) { useStore.setState({ replyTo: null }); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onFile = (e) => {
    const f = e.target.files[0];
    if (f) {
      sendFile(f, replyTo?.id);
      useStore.setState({ replyTo: null });
    }
    e.target.value = '';
  };

  const roundBtn = 'grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800';

  return (
    <div className="relative border-t border-slate-200 p-3 dark:border-slate-800">
      {/* Khung "đang trả lời": hiện TIN CŨ được chọn (tác giả gốc + nội dung gốc). Chọn tin khác sẽ ghi đè. */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
          <div className="min-w-0 flex-1 border-l-4 border-brand-500 pl-2">
            <div className="text-xs font-semibold text-brand-500">
              Trả lời {replyTo.sender_id === me.id ? 'chính bạn' : replyTo.sender_name}
            </div>
            <div className="line-clamp-2 break-words text-slate-600 dark:text-slate-300">{previewOf(replyTo)}</div>
          </div>
          <button onClick={() => useStore.setState({ replyTo: null })} title="Hủy trả lời (Esc)"
            className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
      )}

      {candidates.length > 0 && (
        <ul className="absolute bottom-full left-3 z-30 mb-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {candidates.map((u, i) => (
            <li key={u.id}>
              <button onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === idx ? 'bg-brand-50 dark:bg-slate-700' : ''}`}>
                <span className="font-medium">@{u.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}

      <div className="flex items-end gap-1">
        <input ref={fileRef} type="file" hidden onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} title="Đính kèm ảnh, video, tệp" className={roundBtn}>
          <Paperclip size={20} />
        </button>
        <button onClick={() => setEmojiOpen((v) => !v)} title="Biểu tượng cảm xúc"
          className={`${roundBtn} ${emojiOpen ? 'text-brand-500' : ''}`}>
          <Smile size={20} />
        </button>
        <textarea ref={ta} rows={1} value={text} onChange={onChange} onKeyDown={onKeyDown} onFocus={markRead}
          placeholder={active.kind === 'group' ? 'Nhập tin nhắn... (gõ @ để nhắc tên)' : 'Nhập tin nhắn...'}
          className="mx-1 max-h-36 flex-1 resize-none rounded-2xl bg-slate-100 px-4 py-2.5 outline-none placeholder:text-slate-400 dark:bg-slate-800" />
        <button onClick={send} disabled={!text.trim()} title="Gửi"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-40">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
