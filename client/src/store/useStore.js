import { create } from 'zustand';

// Toàn bộ state dùng chung. Logic cập nhật nằm ở store/chat.js (gọi useStore.setState)
export const useStore = create(() => ({
  me: null,
  conversations: [],   // [{ kind:'dm'|'group', id, name, status?, content, type, last_at, unread, ... }]
  active: null,        // { kind, id }
  group: null,         // thông tin + thành viên của nhóm đang mở
  messages: [],
  hasMore: true,       // còn tin cũ hơn để tải?
  detached: false,     // đang xem một "cửa sổ" tin nhắn cũ (sau khi nhảy tới tin ghim/tìm kiếm)
  pinned: [],
  typing: {},          // { 'dm:3' | 'group:5': { name, t } }
  toasts: [],
  replyTo: null,
  searchOpen: false,
  uploading: 0,
  outbox: [],          // tin/tệp đang gửi: pending -> retrying -> (ACK: biến mất) | failed
  net: { state: 'connecting', attempt: 0 },  // connecting | online | reconnecting | failed | replaced
}));
