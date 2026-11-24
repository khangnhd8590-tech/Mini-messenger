const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { httpErr } = require('../utils/http');
const { isGroupMember, canAccessMessage, roomsFor } = require('../utils/permissions');
const { dmRoom, groupRoom, parseRoom } = require('../utils/rooms');
const { createMessage, getMessage, getReactions } = require('../services/messages');
const routing = require('../net/routing');
const { log, warn } = require('../net/log');
const { once } = require('../net/idempotency');
const { needSeq } = require('../net/validate');
const { authRoom } = require('../net/room-auth');
const { UPLOAD_DIR } = require('../net/storage');
const registerTransfer = require('../net/transfer');

const ALLOWED_EMOJI = ['❤️', '👍', '😂', '😮', '😢', '😡'];
// Chỉ để THỬ NGHIỆM Retry/Idempotency: xác suất server xử lý xong nhưng cố tình "làm rơi" ACK
const CHAOS = Math.min(1, Math.max(0, Number(process.env.NET_CHAOS_DROP_ACK) || 0));

module.exports = (io) => {
  // ---- Xác thực JWT: KHÔNG tin userId do client gửi lên ----
  io.use(async (socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      const { rows } = await db.query('SELECT id, username FROM users WHERE id=$1', [id]);
      if (!rows[0]) throw new Error('no user');
      socket.userId = rows[0].id;
      socket.username = rows[0].username;
      socket.data = { userId: rows[0].id, username: rows[0].username };
      next();
    } catch {
      warn('AUTH', `từ chối kết nối socket=${socket.id} (token không hợp lệ)`);
      next(new Error('unauthorized'));
    }
  });

  // Cập nhật DB + báo cho các client liên quan (mọi user đang online thấy nhau trong danh bạ)
  const setStatus = async (id, status) => {
    await db.query('UPDATE users SET status=$2, last_seen=now() WHERE id=$1', [id, status]);
    const n = routing.emitToOnline(io, 'presence', { userId: id, status, last_seen: new Date() }, id);
    log('PRESENCE', `user #${id} → ${status} | đã báo cho ${n} client`);
  };

  io.on('connection', (socket) => {
    const uid = socket.userId;
    const name = socket.username;

    /* ---------- Routing table ---------- */
    const prevSid = routing.register(uid, socket.id);
    log('CONNECT', `${name}(#${uid}) socket=${socket.id} transport=${socket.conn.transport.name} | online=${routing.size()} [${routing.onlineIds()}]`);
    if (prevSid && prevSid !== socket.id) {
      const old = io.sockets.sockets.get(prevSid);
      warn('ROUTE', `${name}(#${uid}) mở phiên mới → thay thế socket cũ ${prevSid}`);
      if (old) { old.emit('session:replaced'); old.disconnect(true); }
    }

    /* ---------- Wrapper handler + ACK ---------- */
    const sendAck = (ack, body, p) => {
      if (typeof ack !== 'function') return;
      if (CHAOS && body.ok && p && p.sequence_id && Math.random() < CHAOS) {
        warn('CHAOS', `cố ý KHÔNG gửi ACK (seq=${p.sequence_id}${p.chunk_index !== undefined ? ` chunk=${p.chunk_index}` : ''}) để thử Retry/Idempotency`);
        return;
      }
      ack(body);
    };
    // raw = true: handler tự trả nguyên body ACK; raw = false: bọc thành { ok, data }
    const wrap = (event, fn, raw) =>
      socket.on(event, async (payload, ack) => {
        const p = payload && typeof payload === 'object' ? payload : {};
        try {
          const out = await fn(p);
          sendAck(ack, raw ? out : { ok: true, data: out }, p);
        } catch (e) {
          if (!e.status) console.error(`[${event}]`, e);
          else warn('REJECT', `${event} từ ${name}: ${e.message}${e.code ? ` (${e.code})` : ''}`);
          sendAck(ack, {
            ok: false, error: e.status ? e.message : 'Lỗi máy chủ', code: e.code, expected: e.expected,
            sequence_id: p.sequence_id, upload_id: p.upload_id,
          }, null);
        }
      });
    const on = (event, fn) => wrap(event, fn, false);
    const onRaw = (event, fn) => wrap(event, fn, true);

    /* ---------- Text: sequence_id + ACK + Idempotency ---------- */
    onRaw('message:send', async (p) => {
      const seq = needSeq(p.sequence_id);
      const r = await authRoom(uid, p.roomId);
      log('RECV', `message:send seq=${seq} ${name} → ${p.roomId} (${String(p.content || '').length} ký tự)`);
      const res = await once(`${uid}:${seq}`, () => createMessage(io, uid, {
        ...(r.kind === 'group' ? { groupId: r.groupId } : { to: r.otherId }),
        sequence_id: seq, content: String(p.content || ''), replyToId: parseInt(p.replyToId, 10) || null,
      }, { socket }));
      log('ACK', `message:send seq=${seq} → ACK${res.duplicate ? ' (duplicate)' : ''} msg #${res.msg.id}`);
      return { ok: true, type: 'ACK', sequence_id: seq, duplicate: res.duplicate, message: res.msg };
    });

    // Ảnh / video / file: file:send (nguyên khối) và upload:chunk (video > 5MB)
    registerTransfer(io, socket, onRaw);

    /* ---------- Đồng bộ lại sau reconnect: join lại room + snapshot online ---------- */
    onRaw('sync:state', async (p) => {
      const ids = Array.isArray(p.roomIds) ? p.roomIds.slice(0, 500) : [];
      const { rows } = await db.query('SELECT group_id FROM group_members WHERE user_id=$1', [uid]);
      const myGroups = new Set(rows.map((r) => r.group_id));
      const joined = [];
      for (const rid of ids) {
        const r = parseRoom(rid, uid);
        if (!r || (r.kind === 'group' && !myGroups.has(r.groupId))) continue; // chỉ join phòng thực sự thuộc về mình
        socket.join(rid);
        joined.push(rid);
      }
      log('SYNC', `${name}(#${uid}) đồng bộ: join lại ${joined.length}/${ids.length} room | online=[${routing.onlineIds()}]`);
      return { ok: true, type: 'SYNC', rooms: joined, online: routing.onlineIds() };
    });

    on('group:join', async (p) => {
      if (!(await isGroupMember(parseInt(p.groupId, 10), uid))) throw httpErr(403, 'forbidden');
      socket.join(groupRoom(p.groupId));
    });

    // "Đang soạn tin": chỉ gửi cho các thành viên KHÁC trong đúng phòng
    on('typing', async (p) => {
      const r = await authRoom(uid, p.roomId);
      socket.to(p.roomId).emit('typing', { from: uid, name, groupId: r.kind === 'group' ? r.groupId : null });
    });

    // Đánh dấu đã đọc: { kind: 'dm'|'group', id }
    on('message:read', async (p) => {
      const id = parseInt(p.id, 10);
      if (p.kind === 'group') {
        if (!(await isGroupMember(id, uid))) throw httpErr(403, 'forbidden');
        await db.query(
          `INSERT INTO group_reads(group_id, user_id, last_read_message_id)
           SELECT $1::int, $2::int, COALESCE(MAX(id), 0) FROM messages WHERE group_id = $1::int
           ON CONFLICT (group_id, user_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id`,
          [id, uid]);
      } else {
        const { rows } = await db.query(
          `UPDATE messages SET is_read = true, delivered_at = COALESCE(delivered_at, now())
           WHERE receiver_id = $1 AND sender_id = $2 AND is_read = false RETURNING id`, [uid, id]);
        if (rows.length) routing.emitTo(io, id, 'message:read', { ids: rows.map((r) => r.id), by: uid });
      }
      socket.emit('conversation:read', { kind: p.kind === 'group' ? 'group' : 'dm', id });
    });

    on('reaction:toggle', async (p) => {
      const messageId = parseInt(p.messageId, 10);
      if (!ALLOWED_EMOJI.includes(p.emoji)) throw httpErr(400, 'Emoji không hợp lệ');
      const m = await canAccessMessage(uid, messageId);   // phải có quyền xem tin gốc
      if (!m) throw httpErr(403, 'forbidden');
      if (m.recalled_at) throw httpErr(400, 'Tin nhắn đã được thu hồi');
      const cur = (await db.query(
        'SELECT emoji FROM message_reactions WHERE message_id=$1 AND user_id=$2', [messageId, uid])).rows[0];
      if (cur && cur.emoji === p.emoji) {
        await db.query('DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2', [messageId, uid]);
      } else {
        await db.query(
          `INSERT INTO message_reactions(message_id, user_id, emoji) VALUES ($1,$2,$3)
           ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji`, [messageId, uid, p.emoji]);
      }
      io.to(roomsFor(m)).emit('reaction:update', { messageId, reactions: await getReactions(messageId) });
    });

    on('message:pin', async (p) => {
      const messageId = parseInt(p.messageId, 10);
      const m = await canAccessMessage(uid, messageId);
      if (!m) throw httpErr(403, 'forbidden');
      if (m.recalled_at) throw httpErr(400, 'Tin nhắn đã được thu hồi');
      await db.query('UPDATE messages SET is_pinned = NOT is_pinned WHERE id=$1', [messageId]);
      io.to(roomsFor(m)).emit('message:updated', await getMessage(messageId));
    });

    // THU HỒI: chỉ người gửi, tin biến mất với MỌI người (nội dung + file bị xóa khỏi server)
    on('message:recall', async (p) => {
      const messageId = parseInt(p.messageId, 10);
      const row = (await db.query(
        'SELECT id, sender_id, receiver_id, group_id, file_path, recalled_at FROM messages WHERE id=$1',
        [messageId])).rows[0];
      if (!row || row.sender_id !== uid) throw httpErr(403, 'Bạn chỉ có thể thu hồi tin nhắn của chính mình');
      if (row.group_id && !(await isGroupMember(row.group_id, uid))) throw httpErr(403, 'Bạn không thuộc nhóm này');
      if (row.recalled_at) return;
      await db.query(
        `UPDATE messages SET recalled_at = now(), content = '', file_name = NULL, file_size = NULL,
                file_path = NULL, file_mime = NULL, is_pinned = false WHERE id = $1`, [messageId]);
      await db.query('DELETE FROM message_reactions WHERE message_id=$1', [messageId]);
      await db.query('DELETE FROM message_mentions WHERE message_id=$1', [messageId]);
      if (row.file_path) fs.unlink(path.join(UPLOAD_DIR, path.basename(row.file_path)), () => {});
      io.to(roomsFor(row)).emit('message:updated', await getMessage(messageId));
    });

    // XÓA Ở PHÍA TÔI: chỉ ẩn với người xóa, người khác vẫn thấy
    on('message:delete', async (p) => {
      const messageId = parseInt(p.messageId, 10);
      const m = await canAccessMessage(uid, messageId);
      if (!m) throw httpErr(403, 'forbidden');
      await db.query(
        'INSERT INTO message_deletions(message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [messageId, uid]);
      socket.emit('message:deleted', { messageId });
    });

    /* ---------- Disconnect: dọn routing table, offline trong DB, báo client liên quan ---------- */
    socket.on('disconnect', async (reason) => {
      const wasCurrent = routing.unregister(uid, socket.id);
      log('DISCONNECT', `${name}(#${uid}) socket=${socket.id} reason="${reason}" ${wasCurrent ? '' : '(socket cũ đã bị thay thế, giữ nguyên online) '}| online=${routing.size()} [${routing.onlineIds()}]`);
      if (!wasCurrent) return;
      try {
        await setStatus(uid, 'offline');
        // Nếu trong lúc ghi DB user đã kết nối lại -> không để kẹt offline
        if (routing.isOnline(uid)) await setStatus(uid, 'online');
      } catch (e) { console.error('disconnect', e); }
    });
    socket.on('error', (e) => warn('SOCKET', `${name}: ${e.message}`));

    /* ---------- Setup bất đồng bộ khi vừa kết nối ---------- */
    (async () => {
      // Tự join mọi phòng mà user THỰC SỰ thuộc về (truy vấn từ DB): nhóm + phòng 1-1 với từng user
      const { rows: gs } = await db.query('SELECT group_id FROM group_members WHERE user_id=$1', [uid]);
      gs.forEach((r) => socket.join(groupRoom(r.group_id)));
      const { rows: us } = await db.query('SELECT id FROM users WHERE id<>$1', [uid]);
      us.forEach((r) => {
        const room = dmRoom(uid, r.id);
        socket.join(room);
        routing.joinRoom(io, r.id, room); // đối phương đang online (kể cả user mới đăng ký) cũng vào phòng
      });
      log('ROUTE', `${name}(#${uid}) join ${gs.length} room nhóm + ${us.length} room 1-1`);

      await setStatus(uid, 'online');

      // Tin gửi cho mình lúc offline -> nay là "đã nhận"
      const { rows } = await db.query(
        `UPDATE messages SET delivered_at = now()
         WHERE receiver_id = $1 AND delivered_at IS NULL RETURNING id, sender_id`, [uid]);
      const bySender = {};
      rows.forEach((r) => (bySender[r.sender_id] ||= []).push(r.id));
      Object.entries(bySender).forEach(([sid, ids]) => routing.emitTo(io, Number(sid), 'message:delivered', { ids }));
    })().catch((e) => console.error('connection setup', e));
  });
};
