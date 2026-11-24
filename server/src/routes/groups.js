const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { h, httpErr } = require('../utils/http');
const { isGroupMember } = require('../utils/permissions');
const { groupRoom } = require('../utils/rooms');
const routing = require('../net/routing');

router.use(auth);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Tên nhóm không được trống').max(100),
  memberIds: z.array(z.number().int()).max(200).default([]),
});

// Tạo nhóm
router.post('/', h(async (req, res) => {
  const io = req.app.get('io');
  const { name, memberIds } = createSchema.parse(req.body);
  const me = req.user.id;
  const ids = [...new Set([me, ...memberIds])];

  const client = await db.connect();
  let group;
  try {
    await client.query('BEGIN');
    group = (await client.query(
      'INSERT INTO groups(name, created_by) VALUES ($1,$2) RETURNING *', [name, me])).rows[0];
    await client.query(
      'INSERT INTO group_members(group_id, user_id) SELECT $1::int, id FROM users WHERE id = ANY($2::int[])',
      [group.id, ids]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  for (const uid of ids) {
    routing.joinRoom(io, uid, groupRoom(group.id));   // cho join room ngay lập tức
    routing.emitTo(io, uid, 'group:added', { groupId: group.id });
  }
  res.json(group);
}));

// Thông tin nhóm + danh sách thành viên (chỉ thành viên mới xem được)
router.get('/:id', h(async (req, res) => {
  const groupId = +req.params.id;
  if (!(await isGroupMember(groupId, req.user.id))) throw httpErr(403, 'Bạn không thuộc nhóm này');
  const group = (await db.query('SELECT id, name, created_by FROM groups WHERE id=$1', [groupId])).rows[0];
  const members = (await db.query(
    `SELECT u.id, u.username, u.status FROM group_members gm
     JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1 ORDER BY u.username`, [groupId])).rows;
  res.json({ ...group, members: members.map((m) => ({ ...m, status: routing.isOnline(m.id) ? 'online' : 'offline' })) });
}));

// Thêm thành viên: người thực hiện BẮT BUỘC phải là thành viên của nhóm
router.post('/:id/members', h(async (req, res) => {
  const io = req.app.get('io');
  const groupId = +req.params.id;
  const { userId } = z.object({ userId: z.number().int() }).parse(req.body);

  if (!(await isGroupMember(groupId, req.user.id)))
    throw httpErr(403, 'Bạn không thuộc nhóm này nên không thể thêm người khác');
  if (!(await db.query('SELECT 1 FROM users WHERE id=$1', [userId])).rowCount)
    throw httpErr(404, 'Không tìm thấy người dùng');

  await db.query(
    'INSERT INTO group_members(group_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [groupId, userId]);

  routing.joinRoom(io, userId, groupRoom(groupId));
  routing.emitTo(io, userId, 'group:added', { groupId });
  io.to(groupRoom(groupId)).emit('group:members', { groupId });
  res.json({ ok: true });
}));

module.exports = router;
