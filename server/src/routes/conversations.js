const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { h } = require('../utils/http');
const routing = require('../net/routing');

const NOT_DELETED = `NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = $1)`;

// Danh sách cột 2: mọi user (chat 1-1) + các nhóm mà mình là thành viên
router.get('/', auth, h(async (req, res) => {
  const me = req.user.id;

  const dms = await db.query(`
    SELECT 'dm' AS kind, u.id, u.username AS name, u.status, u.last_seen,
           lm.content, lm.type, lm.recalled_at, lm.created_at AS last_at,
           lm.sender_id AS last_sender_id, lm.sender_name AS last_sender_name,
           (SELECT COUNT(*)::int FROM messages m
             WHERE m.sender_id = u.id AND m.receiver_id = $1 AND m.is_read = false
               AND m.recalled_at IS NULL AND ${NOT_DELETED}) AS unread
    FROM users u
    LEFT JOIN LATERAL (
      SELECT m.content, m.type, m.recalled_at, m.created_at, m.sender_id, su.username AS sender_name
      FROM messages m JOIN users su ON su.id = m.sender_id
      WHERE ((m.sender_id = $1 AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = $1))
        AND ${NOT_DELETED}
      ORDER BY m.id DESC LIMIT 1
    ) lm ON true
    WHERE u.id <> $1`, [me]);

  const groups = await db.query(`
    SELECT 'group' AS kind, g.id, g.name,
           lm.content, lm.type, lm.recalled_at, lm.created_at AS last_at,
           lm.sender_id AS last_sender_id, lm.sender_name AS last_sender_name,
           (SELECT COUNT(*)::int FROM messages m
             WHERE m.group_id = g.id AND m.sender_id <> $1 AND m.recalled_at IS NULL AND ${NOT_DELETED}
               AND m.id > COALESCE(gr.last_read_message_id, 0)) AS unread
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
    LEFT JOIN group_reads gr ON gr.group_id = g.id AND gr.user_id = $1
    LEFT JOIN LATERAL (
      SELECT m.content, m.type, m.recalled_at, m.created_at, m.sender_id, su.username AS sender_name
      FROM messages m JOIN users su ON su.id = m.sender_id
      WHERE m.group_id = g.id AND ${NOT_DELETED}
      ORDER BY m.id DESC LIMIT 1
    ) lm ON true`, [me]);

  const dmRows = dms.rows.map((r) => ({ ...r, status: routing.isOnline(r.id) ? 'online' : 'offline' }));
  res.json([...dmRows, ...groups.rows]);
}));

module.exports = router;
