const db = require('../db');
const { isGroupMember, roomsFor } = require('../utils/permissions');
const { httpErr } = require('../utils/http');
const routing = require('../net/routing');
const { log } = require('../net/log');

// Câu SELECT chuẩn: tin nhắn + tên người gửi + tin được trích dẫn + reactions + mentions
const SELECT = `
  SELECT m.id, m.sender_id, su.username AS sender_name, m.receiver_id, m.group_id,
         m.content, m.type, m.file_name, m.file_size, m.file_mime, m.reply_to_id,
         m.is_pinned, m.recalled_at, m.sequence_id, m.delivered_at, m.is_read, m.created_at,
         CASE WHEN r.id IS NULL THEN NULL ELSE
           json_build_object('id', r.id, 'sender_id', r.sender_id, 'sender_name', ru.username,
                             'content', r.content, 'type', r.type, 'recalled_at', r.recalled_at)
         END AS reply_to,
         COALESCE((SELECT json_agg(json_build_object('user_id', mr.user_id, 'emoji', mr.emoji))
                   FROM message_reactions mr WHERE mr.message_id = m.id), '[]'::json) AS reactions,
         COALESCE((SELECT json_agg(mm.user_id) FROM message_mentions mm WHERE mm.message_id = m.id), '[]'::json) AS mentions
  FROM messages m
  JOIN users su ON su.id = m.sender_id
  LEFT JOIN messages r ON r.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = r.sender_id
`;

// $1 = id người đang xem, $2 = id đối phương (dm) hoặc id nhóm (group)
// Luôn loại các tin mà người xem đã chọn "Xóa ở phía tôi"
const NOT_DELETED = `NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = $1)`;
const conversationWhere = (kind) =>
  (kind === 'group'
    ? '(m.group_id = $2 AND $1::int > 0)'
    : '((m.sender_id = $1 AND m.receiver_id = $2) OR (m.sender_id = $2 AND m.receiver_id = $1))')
  + ` AND ${NOT_DELETED}`;

const getMessage = async (id) => (await db.query(`${SELECT} WHERE m.id = $1`, [id])).rows[0];

const getReactions = async (messageId) =>
  (await db.query('SELECT user_id, emoji FROM message_reactions WHERE message_id=$1', [messageId])).rows;

// Tìm tin đã xử lý trước đó theo sequence_id (Idempotency)
async function findBySequence(senderId, seq) {
  const { rows } = await db.query('SELECT id FROM messages WHERE sender_id=$1 AND sequence_id=$2', [senderId, seq]);
  return rows[0] ? getMessage(rows[0].id) : null;
}

/**
 * Tạo tin nhắn (text / ảnh / video / file) và multicast vào room.
 * d: { to, groupId, sequence_id, content, type, fileName, fileSize, filePath, fileMime, replyToId }
 * opts.socket: nếu có, dùng socket.to(room) để gửi cho các thành viên KHÁC trong phòng (người gửi nhận qua ACK).
 * Trả về { msg, duplicate }. duplicate = true nghĩa là sequence_id đã xử lý -> KHÔNG ghi DB, KHÔNG emit lại.
 */
async function createMessage(io, senderId, d, opts = {}) {
  const seq = d.sequence_id || null;
  if (seq) {
    const existing = await findBySequence(senderId, seq);
    if (existing) {
      log('IDEMPOTENT', `seq=${seq} đã xử lý (msg #${existing.id}) → bỏ qua ghi DB/emit, chỉ gửi lại ACK`);
      return { msg: existing, duplicate: true };
    }
  }
  const type = d.type || 'text';
  const content = (d.content || '').trim();
  if (type === 'text' && !content) throw httpErr(400, 'Tin nhắn trống');
  if (content.length > 5000) throw httpErr(400, 'Tin nhắn quá dài (tối đa 5000 ký tự)');

  let receiverId = null;
  let groupId = null;

  if (d.groupId) {
    // BẢO MẬT: chỉ thành viên mới được gửi vào nhóm
    if (!(await isGroupMember(d.groupId, senderId))) throw httpErr(403, 'Bạn không thuộc nhóm này');
    groupId = d.groupId;
  } else {
    if (!d.to || d.to === senderId) throw httpErr(400, 'Người nhận không hợp lệ');
    const u = await db.query('SELECT 1 FROM users WHERE id=$1', [d.to]);
    if (!u.rowCount) throw httpErr(404, 'Không tìm thấy người nhận');
    receiverId = d.to;
  }

  // Tin được trả lời phải nằm trong cùng cuộc trò chuyện
  if (d.replyToId) {
    const r = (await db.query(
      'SELECT sender_id, receiver_id, group_id, recalled_at FROM messages WHERE id=$1', [d.replyToId])).rows[0];
    if (r && r.recalled_at) throw httpErr(400, 'Không thể trả lời tin nhắn đã thu hồi');
    const same = r && (groupId
      ? r.group_id === groupId
      : !r.group_id && ((r.sender_id === senderId && r.receiver_id === receiverId) ||
                        (r.sender_id === receiverId && r.receiver_id === senderId)));
    if (!same) throw httpErr(400, 'Tin nhắn trả lời không hợp lệ');
  }

  // "Đã nhận": người nhận đang online (có ít nhất 1 socket)
  const deliveredAt = receiverId && routing.isOnline(receiverId) ? new Date() : null;

  let id;
  try {
    const ins = await db.query(
      `INSERT INTO messages(sender_id, receiver_id, group_id, content, type, file_name, file_size,
                            file_path, file_mime, reply_to_id, delivered_at, sequence_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [senderId, receiverId, groupId, content, type, d.fileName || null, d.fileSize || null,
       d.filePath || null, d.fileMime || null, d.replyToId || null, deliveredAt, seq]);
    id = ins.rows[0].id;
  } catch (e) {
    // Hai yêu cầu cùng sequence_id va nhau ở tầng DB -> coi như trùng
    if (e.code === '23505' && seq) {
      const existing = await findBySequence(senderId, seq);
      if (existing) {
        log('IDEMPOTENT', `seq=${seq} trùng ở tầng DB (msg #${existing.id}) → bỏ qua`);
        return { msg: existing, duplicate: true };
      }
    }
    throw e;
  }

  // @mention: chỉ tính những người thực sự là thành viên nhóm
  let mentioned = [];
  if (groupId && content) {
    const names = [...content.matchAll(/@(\w+)/g)].map((x) => x[1].toLowerCase());
    if (names.length) {
      const { rows } = await db.query(
        `SELECT u.id FROM users u JOIN group_members gm ON gm.user_id = u.id
         WHERE gm.group_id = $1 AND lower(u.username) = ANY($2::text[]) AND u.id <> $3`,
        [groupId, names, senderId]);
      mentioned = rows.map((r) => r.id);
      for (const uid of mentioned)
        await db.query('INSERT INTO message_mentions(message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, uid]);
    }
  }

  const msg = await getMessage(id);

  // Multicast đúng phòng: socket.to(room) -> mọi thành viên trong phòng TRỪ người gửi
  const room = roomsFor(msg);
  if (receiverId) { routing.joinRoom(io, senderId, room); routing.joinRoom(io, receiverId, room); }
  (opts.socket ? opts.socket.to(room) : io.to(room)).emit('message:new', msg);
  const members = (await io.in(room).fetchSockets()).filter((s) => s.id !== opts.socket?.id).map((s) => s.data?.username);
  log('MULTICAST', `message:new #${id} (${type}) → room ${room} → [${members.join(', ') || 'không ai online'}]`);

  if (mentioned.length) {
    const g = (await db.query('SELECT name FROM groups WHERE id=$1', [groupId])).rows[0];
    for (const uid of mentioned)
      routing.emitTo(io, uid, 'mention', {
        messageId: id, groupId, groupName: g.name, from: msg.sender_name, content: msg.content,
      });
  }
  return { msg, duplicate: false };
}

module.exports = { SELECT, conversationWhere, getMessage, getReactions, findBySequence, createMessage };
