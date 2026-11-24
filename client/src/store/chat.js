import { useStore } from './useStore';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import { playSound } from '@/lib/sound';
import { NET, ackTimeoutFor, clog, cwarn, newId, reliableEmit, roomIdOf } from '@/lib/net';
import { fmtSize } from '@/lib/format';

const st = () => useStore.getState();
const set = (p) => useStore.setState(p);
const sameConv = (a, b) => a && b && a.kind === b.kind && a.id === b.id;
export const keyOf = (c) => `${c.kind}:${c.id}`;

// Tin nhắn m thuộc cuộc trò chuyện nào (theo góc nhìn của mình)
const convOfMessage = (m, myId) =>
  m.group_id
    ? { kind: 'group', id: m.group_id }
    : { kind: 'dm', id: m.sender_id === myId ? m.receiver_id : m.sender_id };

/* ------------------------------ Toast ------------------------------ */
export function pushToast(t) {
  const id = Date.now() + Math.random();
  set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 6000);
}
export const closeToast = (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));

/* ------------------------------ Tải dữ liệu ------------------------------ */
export async function loadConversations() {
  set({ conversations: await api('/conversations') });
}

async function loadLatest() {
  const a = st().active;
  const rows = await api(`/messages?kind=${a.kind}&id=${a.id}&limit=30`);
  if (sameConv(st().active, a)) set({ messages: rows, hasMore: rows.length === 30, detached: false });
}

export async function loadPinned() {
  const a = st().active;
  if (!a) return;
  const rows = await api(`/messages/pinned?kind=${a.kind}&id=${a.id}`);
  if (sameConv(st().active, a)) set({ pinned: rows });
}

export async function refreshGroup() {
  const a = st().active;
  if (!a || a.kind !== 'group') return;
  const g = await api(`/groups/${a.id}`);
  if (sameConv(st().active, a)) set({ group: g });
}

let loadingOlder = false;
export async function loadOlder() {
  const { active, messages, hasMore } = st();
  if (loadingOlder || !hasMore || !active || !messages.length) return;
  loadingOlder = true;
  try {
    const rows = await api(`/messages?kind=${active.kind}&id=${active.id}&before=${messages[0].id}&limit=30`);
    if (sameConv(st().active, active)) set((s) => ({ messages: [...rows, ...s.messages], hasMore: rows.length === 30 }));
  } finally {
    loadingOlder = false;
  }
}

export async function openConversation(c) {
  set({
    active: { kind: c.kind, id: c.id }, messages: [], hasMore: true, detached: false,
    pinned: [], group: null, replyTo: null, searchOpen: false,
  });
  try {
    await loadLatest();
    markRead();
    loadPinned();
    refreshGroup();
  } catch (e) {
    pushToast({ title: 'Không tải được tin nhắn', text: e.message });
  }
}

export const closeConversation = () => set({ active: null });

export async function backToLatest() {
  await loadLatest();
}

// Sau reconnect: nạp lại tin mới mà không reset khung chat đang mở
async function resyncActive() {
  const a = st().active;
  if (!a || st().detached) return;
  try { await loadLatest(); await loadPinned(); await refreshGroup(); } catch { /* bỏ qua, lần sau thử lại */ }
}

/* ------------------------------ Nhảy tới tin nhắn ------------------------------ */
export function flash(id) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('flash');
  void el.offsetWidth; // restart animation
  el.classList.add('flash');
}

export async function jumpTo(id) {
  if (document.getElementById(`msg-${id}`)) return flash(id);
  const { messages, hasNewer } = await api(`/messages/around/${id}`);
  set({ messages, hasMore: true, detached: hasNewer });
  requestAnimationFrame(() => requestAnimationFrame(() => flash(id)));
}

/* ====================================================================
 *  GỬI TIN / FILE: sequence_id + ACK + Retry (hàng đợi "outbox")
 *  Trạng thái: pending -> retrying -> (ACK nhận được: tin chuyển vào khung chat) | failed
 * ==================================================================== */
const outboxData = new Map(); // sequence_id -> { content } | { file, uploadId }  (File không đưa vào store)

const patchOutbox = (id, patch) =>
  set((s) => ({ outbox: s.outbox.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));
const inOutbox = (id) => st().outbox.some((o) => o.id === id);

// Nhận ACK (hoặc VIDEO_ACK): đưa tin thật vào khung chat, bỏ khỏi outbox. Gọi nhiều lần vẫn an toàn.
function onAcked(id, msg) {
  const it = st().outbox.find((o) => o.id === id);
  if (!it || !msg) return;
  const { active, detached, me } = st();
  const here = sameConv(active, { kind: it.kind, id: it.convId });
  set((s) => ({
    outbox: s.outbox.filter((o) => o.id !== id),
    messages: here && !detached && !s.messages.some((m) => m.id === msg.id) ? [...s.messages, msg] : s.messages,
  }));
  outboxData.delete(id);
  bumpConversation(msg, me.id, here && !document.hidden);
  playSound('send');
}

async function runOutbox(id) {
  const it = st().outbox.find((o) => o.id === id);
  const data = outboxData.get(id);
  if (!it || !data) return;
  const roomId = roomIdOf(it.kind, it.convId, st().me.id);
  const onState = (status, attempt) => patchOutbox(id, { status, attempt });
  patchOutbox(id, { status: 'pending', attempt: 0, error: null });
  const t0 = performance.now();

  try {
    let res;
    if (it.mode === 'text') {
      res = await reliableEmit('message:send',
        { sequence_id: id, roomId, content: data.content, replyToId: it.replyToId },
        { timeoutMs: NET.TEXT_ACK_TIMEOUT, label: `text seq=${id}`, onState });
    } else if (it.mode === 'block') {
      const f = data.file;
      const buf = await f.arrayBuffer();
      clog('SEND', `nhị phân nguyên khối "${f.name}" ${fmtSize(f.size)} (chờ ACK tối đa ${ackTimeoutFor(f.size) / 1000}s/lần)`);
      res = await reliableEmit('file:send', {
        sequence_id: id, roomId, fileName: f.name, fileType: f.type || 'application/octet-stream',
        fileSize: f.size, replyToId: it.replyToId, data: buf,
      }, { timeoutMs: ackTimeoutFor(f.size), label: `${it.type} "${f.name}" seq=${id}`, onState });
    } else {
      res = await sendChunked(id, it, data, roomId, onState);
    }
    clog('DONE', `seq=${id} hoàn tất sau ${((performance.now() - t0) / 1000).toFixed(2)}s`);
    onAcked(id, res.message);
  } catch (e) {
    cwarn('FAILED', `seq=${id}: ${e.message}`);
    if (inOutbox(id)) patchOutbox(id, { status: 'failed', error: e.message });
  }
}

// Video > 5MB: cắt bằng File.slice(), gửi lần lượt từng chunk, mỗi chunk phải có CHUNK_ACK mới gửi chunk kế
async function sendChunked(id, it, data, roomId, onState) {
  const f = data.file;
  const total = Math.ceil(f.size / NET.CHUNK_SIZE);
  const uploadId = data.uploadId;
  let i = 0;
  let resyncs = 0;
  const t0 = performance.now();
  clog('CHUNK', `bắt đầu upload ${uploadId} "${f.name}" ${fmtSize(f.size)} → ${total} chunk × ${NET.CHUNK_SIZE / 1024}KB`);

  while (i < total) {
    const buf = await f.slice(i * NET.CHUNK_SIZE, Math.min(f.size, (i + 1) * NET.CHUNK_SIZE)).arrayBuffer();
    try {
      const res = await reliableEmit('upload:chunk', {
        upload_id: uploadId, chunk_index: i, total_chunks: total, sequence_id: id, roomId,
        fileName: f.name, fileType: f.type || 'video/mp4', fileSize: f.size, replyToId: it.replyToId, data: buf,
      }, { timeoutMs: NET.CHUNK_ACK_TIMEOUT, label: `chunk ${i + 1}/${total}`, onState });

      if (res.done) {
        clog('VIDEO_ACK', `upload ${uploadId} xong sau ${((performance.now() - t0) / 1000).toFixed(2)}s`);
        return res;
      }
      i = typeof res.next === 'number' ? res.next : i + 1;
      patchOutbox(id, { status: 'pending', attempt: 0, progress: Math.round((i / total) * 100) });
    } catch (e) {
      // Server báo đoạn mong đợi (mất phiên do restart / sai thứ tự) -> đồng bộ lại và gửi tiếp từ đó
      if (e.code === 'server' && typeof e.res?.expected === 'number' && ++resyncs <= 5) {
        cwarn('CHUNK', `server yêu cầu bắt đầu lại từ chunk ${e.res.expected} (${e.res.code})`);
        i = e.res.expected;
        patchOutbox(id, { progress: Math.round((i / total) * 100) });
        continue;
      }
      throw e;
    }
  }
  throw new Error('Không nhận được VIDEO_ACK');
}

function enqueue(item, data) {
  set((s) => ({ outbox: [...s.outbox, item] }));
  outboxData.set(item.id, data);
  runOutbox(item.id);
}

export function sendText(content, replyToId) {
  const { active, me } = st();
  if (!active) return;
  const id = newId(`u${me.id}`);
  enqueue({
    id, kind: active.kind, convId: active.id, type: 'text', mode: 'text', label: content,
    size: 0, status: 'pending', attempt: 0, progress: null, error: null, replyToId,
  }, { content });
}

export function sendFile(file, replyToId) {
  const { active, me } = st();
  if (!active || !file) return;
  if (file.size === 0) return pushToast({ title: 'Không gửi được', text: 'File rỗng' });

  const isVideo = file.type.startsWith('video/');
  const mode = isVideo && file.size > NET.BLOCK_LIMIT ? 'chunked' : 'block';
  const max = mode === 'chunked' ? NET.MAX_VIDEO : NET.MAX_BLOCK;
  if (file.size > max) return pushToast({ title: 'File quá lớn', text: `Tối đa ${fmtSize(max)} cho loại này` });

  const type = file.type.startsWith('image/') ? 'image' : isVideo ? 'video' : 'file';
  const big = file.size > NET.BLOCK_LIMIT;
  if (mode === 'chunked') clog('ROUTE', `video ${fmtSize(file.size)} > 5MB → chia chunk ${NET.CHUNK_SIZE / 1024}KB (File.slice)`);
  else if (type === 'image') clog('ROUTE', `ảnh ${fmtSize(file.size)} ${big ? '> 5MB' : '≤ 5MB'} → nhị phân nguyên khối`);
  else if (isVideo) clog('ROUTE', `video ${fmtSize(file.size)} ≤ 5MB → nhị phân nguyên khối`);
  else clog('ROUTE', `file ${file.type || 'không rõ loại'} ${fmtSize(file.size)} → nhị phân nguyên khối${big ? ' (file nặng, truyền/lưu sẽ lâu hơn)' : ''}`);

  enqueue({
    id: newId(`u${me.id}`), kind: active.kind, convId: active.id, type, mode, label: file.name,
    size: file.size, status: 'pending', attempt: 0, progress: mode === 'chunked' ? 0 : null,
    error: null, replyToId,
  }, { file, uploadId: mode === 'chunked' ? newId('up') : null });
}

export const retryOutbox = (id) => runOutbox(id);
export function dismissOutbox(id) {
  outboxData.delete(id);
  set((s) => ({ outbox: s.outbox.filter((o) => o.id !== id) }));
}

/* ------------------------------ Thao tác khác ------------------------------ */
export const toggleReaction = (messageId, emoji) => getSocket()?.emit('reaction:toggle', { messageId, emoji });
export const togglePin = (messageId) => getSocket()?.emit('message:pin', { messageId });

// Thu hồi: xóa với mọi người (chỉ tin của mình)
export function recallMessage(id) {
  if (!window.confirm('Thu hồi tin nhắn này với mọi người trong cuộc trò chuyện?')) return;
  getSocket()?.emit('message:recall', { messageId: id }, (res) => {
    if (res?.error) pushToast({ title: 'Không thu hồi được', text: res.error });
  });
}

// Xóa ở phía tôi: chỉ ẩn với mình
export function deleteForMe(id) {
  if (!window.confirm('Xóa tin nhắn này ở phía bạn? Những người khác vẫn thấy tin nhắn.')) return;
  getSocket()?.emit('message:delete', { messageId: id }, (res) => {
    if (res?.error) pushToast({ title: 'Không xóa được', text: res.error });
  });
}

export function markRead() {
  const a = st().active;
  if (!a) return;
  getSocket()?.emit('message:read', { kind: a.kind, id: a.id });
  set((s) => ({
    conversations: s.conversations.map((c) => (sameConv(c, a) ? { ...c, unread: 0 } : c)),
  }));
}

let lastTyping = 0;
export function emitTyping() {
  const now = Date.now();
  if (now - lastTyping < 2000) return; // throttle: tối đa 1 lần / 2 giây
  lastTyping = now;
  const { active, me } = st();
  if (active) getSocket()?.volatile.emit('typing', { roomId: roomIdOf(active.kind, active.id, me.id) });
}

/* ------------------------------ Kết nối ------------------------------ */
const setNet = (patch) => set((s) => ({ net: { ...s.net, ...patch } }));

export function reconnectNow() {
  const s = getSocket();
  if (!s) return;
  setNet({ state: 'connecting', attempt: 0 });
  s.connect();
}

// Sau (re)connect: join lại các roomId đang tham gia + lấy snapshot online để không bị kẹt trạng thái
function syncState() {
  const { me, conversations } = st();
  const roomIds = conversations.map((c) => roomIdOf(c.kind, c.id, me.id));
  getSocket()?.emit('sync:state', { roomIds }, (res) => {
    if (!res?.ok) return cwarn('SYNC', 'đồng bộ thất bại', res);
    const online = new Set(res.online);
    set((s) => ({
      conversations: s.conversations.map((c) => (c.kind === 'dm' ? { ...c, status: online.has(c.id) ? 'online' : 'offline' } : c)),
    }));
    clog('SYNC', `đã join lại ${res.rooms.length} room | online=[${res.online}]`);
  });
}

function clearTyping(key) {
  set((s) => {
    if (!s.typing[key]) return {};
    const { [key]: _removed, ...rest } = s.typing;
    return { typing: rest };
  });
}

function bumpConversation(m, myId, reading) {
  const c = convOfMessage(m, myId);
  if (!st().conversations.some((x) => sameConv(x, c))) { loadConversations(); return; } // user/nhóm mới chưa có trong danh sách
  set((s) => ({
    conversations: s.conversations.map((x) =>
      sameConv(x, c)
        ? {
            ...x, content: m.content, type: m.type, recalled_at: m.recalled_at ?? null, last_at: m.created_at,
            last_sender_id: m.sender_id, last_sender_name: m.sender_name,
            unread: m.sender_id === myId || reading ? x.unread : x.unread + 1,
          }
        : x),
  }));
}

export function bindSocket() {
  const s = connectSocket();
  window.__socket = s; // tiện thử nghiệm trong Console (F12)
  clog('NET', 'khởi tạo kết nối Socket.io');

  const onVisible = () => { if (!document.hidden) markRead(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  // Sự kiện của Manager (tầng reconnect)
  const mgr = {
    reconnect_attempt: (n) => { cwarn('RECONNECT', `đang thử kết nối lại, lần ${n}...`); setNet({ state: 'reconnecting', attempt: n }); },
    reconnect: (n) => clog('RECONNECT', `✅ kết nối lại thành công sau ${n} lần thử`),
    reconnect_error: (e) => cwarn('RECONNECT', `lần thử lỗi: ${e.message}`),
    reconnect_failed: () => { cwarn('RECONNECT', '❌ hết số lần thử'); setNet({ state: 'failed' }); },
  };
  Object.entries(mgr).forEach(([ev, fn]) => s.io.on(ev, fn));

  s.on('connect', () => {
    clog('CONNECT', `đã kết nối id=${s.id} transport=${s.io.engine.transport.name}`);
    setNet({ state: 'online', attempt: 0 });
    loadConversations().then(syncState).catch((e) => cwarn('SYNC', e.message));
    resyncActive();
  });

  s.on('disconnect', (reason) => {
    cwarn('DISCONNECT', `reason="${reason}"`);
    if (reason === 'io server disconnect') { if (st().net.state !== 'replaced') setNet({ state: 'failed' }); } // server chủ động ngắt: socket.io không tự reconnect
    else if (reason !== 'io client disconnect') setNet({ state: 'reconnecting' });
  });

  s.on('session:replaced', () => {
    cwarn('SESSION', 'tài khoản vừa được mở ở nơi khác → phiên này bị thay thế');
    setNet({ state: 'replaced' });
  });

  s.on('connect_error', (e) => {
    cwarn('CONNECT_ERROR', e.message);
    if (e.message === 'unauthorized') {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
  });

  // Tin của NGƯỜI KHÁC (multicast theo room). Tin của mình về qua ACK.
  s.on('message:new', (m) => {
    const { me, active, detached } = st();
    const mine = m.sender_id === me.id;
    const isActive = sameConv(active, convOfMessage(m, me.id));
    const reading = isActive && !document.hidden;

    if (isActive && !detached) set((x) => (x.messages.some((y) => y.id === m.id) ? {} : { messages: [...x.messages, m] }));
    bumpConversation(m, me.id, reading);
    if (reading && !mine) markRead();
    if (!mine) clearTyping(m.group_id ? `group:${m.group_id}` : `dm:${m.sender_id}`);
    playSound(mine ? 'send' : 'receive');
    clog('RECV', `message:new #${m.id} (${m.type}) từ ${m.sender_name}`);
  });

  s.on('VIDEO_ACK', (p) => {
    clog('VIDEO_ACK', `seq=${p?.sequence_id} (sự kiện từ server)`);
    if (p?.message) onAcked(p.sequence_id, p.message);
  });

  s.on('mention', (d) => {
    playSound('mention');
    pushToast({
      title: `${d.from} đã nhắc đến bạn trong ${d.groupName}`,
      text: d.content, mention: true, conv: { kind: 'group', id: d.groupId },
    });
  });

  s.on('typing', ({ from, name, groupId }) => {
    const key = groupId ? `group:${groupId}` : `dm:${from}`;
    const t = Date.now();
    set((x) => ({ typing: { ...x.typing, [key]: { name, t } } }));
    setTimeout(() => { if (st().typing[key]?.t === t) clearTyping(key); }, 3000);
  });

  s.on('presence', ({ userId, status, last_seen }) => {
    clog('PRESENCE', `user #${userId} → ${status}`);
    if (!st().conversations.some((c) => c.kind === 'dm' && c.id === userId)) { loadConversations(); return; } // user mới đăng ký
    set((x) => ({
      conversations: x.conversations.map((c) => (c.kind === 'dm' && c.id === userId ? { ...c, status, last_seen } : c)),
    }));
  });

  s.on('message:delivered', ({ ids }) =>
    set((x) => ({
      messages: x.messages.map((m) => (ids.includes(m.id) ? { ...m, delivered_at: m.delivered_at || new Date().toISOString() } : m)),
    })));

  s.on('message:read', ({ ids }) =>
    set((x) => ({
      messages: x.messages.map((m) =>
        ids.includes(m.id) ? { ...m, is_read: true, delivered_at: m.delivered_at || new Date().toISOString() } : m),
    })));

  s.on('conversation:read', ({ kind, id }) =>
    set((x) => ({ conversations: x.conversations.map((c) => (sameConv(c, { kind, id }) ? { ...c, unread: 0 } : c)) })));

  s.on('reaction:update', ({ messageId, reactions }) =>
    set((x) => ({ messages: x.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) })));

  s.on('message:updated', (msg) => {
    set((x) => ({
      messages: x.messages.map((m) =>
        m.id === msg.id
          ? msg
          // các tin đang trích dẫn tin vừa bị thu hồi cũng phải cập nhật
          : m.reply_to?.id === msg.id
            ? { ...m, reply_to: { ...m.reply_to, content: msg.content, type: msg.type, recalled_at: msg.recalled_at } }
            : m),
      replyTo: x.replyTo?.id === msg.id && msg.recalled_at ? null : x.replyTo,
    }));
    loadPinned();
    if (msg.recalled_at) loadConversations(); // cập nhật preview + badge
  });

  s.on('message:deleted', ({ messageId }) => {
    set((x) => ({
      messages: x.messages.filter((m) => m.id !== messageId),
      pinned: x.pinned.filter((m) => m.id !== messageId),
      replyTo: x.replyTo?.id === messageId ? null : x.replyTo,
    }));
    loadConversations();
  });

  s.on('group:added', () => loadConversations());
  s.on('group:members', ({ groupId }) => {
    const a = st().active;
    if (a?.kind === 'group' && a.id === groupId) refreshGroup();
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    Object.entries(mgr).forEach(([ev, fn]) => s.io.off(ev, fn));
    s.off();
    disconnectSocket();
  };
}
