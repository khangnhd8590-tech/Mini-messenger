const { parseRoom } = require('../utils/rooms');
const { isGroupMember } = require('../utils/permissions');
const { httpErr } = require('../utils/http');

// BẢO MẬT: xác thực user có quyền với roomId do client gửi lên
exports.authRoom = async (uid, roomId) => {
  const r = parseRoom(roomId, uid);
  if (!r) throw httpErr(400, 'roomId không hợp lệ', { code: 'bad_room' });
  if (r.kind === 'group' && !(await isGroupMember(r.groupId, uid)))
    throw httpErr(403, 'Bạn không thuộc nhóm này', { code: 'forbidden' });
  return r;
};
