'use client';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * Auto-scroll thông minh:
 *  - Mở cuộc trò chuyện: nhảy xuống cuối.
 *  - Có tin mới: nếu đang ở cuối (hoặc tin do mình gửi) -> cuộn xuống; ngược lại -> hiện nút "Có tin nhắn mới".
 *  - Tải thêm tin cũ (prepend): giữ nguyên vị trí đang đọc.
 */
export function useAutoScroll(ref, messages, convKey, myId) {
  const atBottom = useRef(true);
  const prev = useRef({ key: null, first: undefined, last: undefined, height: 0 });
  const [away, setAway] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = ref.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, [ref]);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottom.current = near;
    setAway(!near);
    if (near) setNewCount(0);
    prev.current.height = el.scrollHeight;
  }, [ref]);

  // Ảnh/video load xong làm tăng chiều cao -> nếu đang ở cuối thì bám theo
  const onMediaLoad = useCallback(() => {
    if (atBottom.current) scrollToBottom(false);
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = messages[0]?.id;
    const last = messages[messages.length - 1]?.id;

    if (prev.current.key !== convKey) {
      prev.current = { key: convKey, first: undefined, last: undefined, height: 0 };
      atBottom.current = true;
      setAway(false);
      setNewCount(0);
    }
    const p = prev.current;

    if (last === undefined) {
      p.first = p.last = undefined;
      return;
    }
    if (p.last === undefined) {
      el.scrollTop = el.scrollHeight;                       // lần tải đầu
      atBottom.current = true;
    } else if (first !== p.first && last === p.last) {
      el.scrollTop += el.scrollHeight - p.height;           // tin cũ được chèn lên đầu
    } else if (last !== p.last && first === p.first) {      // tin mới ở cuối
      const mine = messages[messages.length - 1].sender_id === myId;
      if (mine || atBottom.current) el.scrollTo({ top: el.scrollHeight });
      else { setNewCount((n) => n + 1); setAway(true); }
    }
    p.first = first;
    p.last = last;
    p.height = el.scrollHeight;
  }, [messages, convKey, myId, ref]);

  return { onScroll, onMediaLoad, scrollToBottom, away, newCount };
}
