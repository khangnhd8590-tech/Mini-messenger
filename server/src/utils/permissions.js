const db = require('../db');

exports.isGroupMember = async (groupId, userId) =>
  (await db.query('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [groupId, userId])).rowCount > 0;

// Trả về tin nhắn (id, sender_id, receiver_id, group_id) nếu user có quyền xem, ngược lại null
exports.canAccessMessage = async (userId, messageId) => {
  const { rows } = await db.query(
    'SELECT id, sender_id, receiver_id, group_id, recalled_at FROM messages WHERE id=$1', [messageId]);
  const m = rows[0];
  if (!m) return null;
  if (m.group_id) return (await exports.isGroupMember(m.group_id, userId)) ? m : null;
  return m.sender_id === userId || m.receiver_id === userId ? m : null;
};

// Room cần phát sự kiện cho một tin nhắn (nhóm: group:<id>, 1-1: dm:<a>:<b>)
exports.roomsFor = require('./rooms').roomOfMessage;
