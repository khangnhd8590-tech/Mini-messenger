const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { h, httpErr } = require('../utils/http');
const { isGroupMember, canAccessMessage } = require('../utils/permissions');
const { SELECT, conversationWhere } = require('../services/messages');

router.use(auth);

const parseConv = (q) => ({ kind: q.kind === 'group' ? 'group' : 'dm', id: parseInt(q.id, 10) });

// BẢO MẬT: mọi API đọc tin nhắn nhóm đều phải qua đây
async function assertConv(userId, kind, id) {
  if (!Number.isInteger(id)) throw httpErr(400, 'id không hợp lệ');
  if (kind === 'group' && !(await isGroupMember(id, userId))) throw httpErr(403, 'Bạn không thuộc nhóm này');
}

// Lịch sử (phân trang ngược theo id): GET /api/messages?kind=dm|group&id=..&before=..&limit=30
router.get('/', h(async (req, res) => {
  const { kind, id } = parseConv(req.query);
  await assertConv(req.user.id, kind, id);
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const { rows } = await db.query(
    `${SELECT} WHERE ${conversationWhere(kind)} AND ($3::int IS NULL OR m.id < $3)
     ORDER BY m.id DESC LIMIT $4`, [req.user.id, id, before, limit]);
  res.json(rows.reverse());
}));

// Tin đã ghim
router.get('/pinned', h(async (req, res) => {
  const { kind, id } = parseConv(req.query);
  await assertConv(req.user.id, kind, id);
  const { rows } = await db.query(
    `${SELECT} WHERE ${conversationWhere(kind)} AND m.is_pinned ORDER BY m.id DESC`, [req.user.id, id]);
  res.json(rows);
}));

// Tìm kiếm trong cuộc trò chuyện
router.get('/search', h(async (req, res) => {
  const { kind, id } = parseConv(req.query);
  await assertConv(req.user.id, kind, id);
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const { rows } = await db.query(
    `${SELECT} WHERE ${conversationWhere(kind)} AND m.type = 'text' AND m.content ILIKE $3
     ORDER BY m.id DESC LIMIT 50`, [req.user.id, id, like]);
  res.json(rows);
}));

// Tải cửa sổ tin nhắn quanh một tin (dùng khi bấm tin ghim / kết quả tìm kiếm nằm ngoài vùng đã tải)
router.get('/around/:id', h(async (req, res) => {
  const me = req.user.id;
  const m = await canAccessMessage(me, parseInt(req.params.id, 10));
  if (!m) throw httpErr(404, 'Không tìm thấy tin nhắn');
  const kind = m.group_id ? 'group' : 'dm';
  const cid = m.group_id || (m.sender_id === me ? m.receiver_id : m.sender_id);
  const where = conversationWhere(kind);
  const older = await db.query(
    `${SELECT} WHERE ${where} AND m.id <= $3 ORDER BY m.id DESC LIMIT 20`, [me, cid, m.id]);
  const newer = await db.query(
    `${SELECT} WHERE ${where} AND m.id > $3 ORDER BY m.id ASC LIMIT 20`, [me, cid, m.id]);
  res.json({ messages: [...older.rows.reverse(), ...newer.rows], hasNewer: newer.rows.length === 20 });
}));

module.exports = router;
