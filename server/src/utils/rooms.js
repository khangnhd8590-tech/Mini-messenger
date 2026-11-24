// roomId chuẩn: chat nhóm "group:<id>", chat 1-1 "dm:<idNhỏ>:<idLớn>"
exports.groupRoom = (id) => `group:${id}`;
exports.dmRoom = (a, b) => `dm:${Math.min(a, b)}:${Math.max(a, b)}`;

// Phân tích roomId từ client theo góc nhìn của user uid. Trả null nếu sai định dạng
// hoặc nếu uid không phải một đầu của phòng DM.
exports.parseRoom = (roomId, uid) => {
  if (typeof roomId !== 'string') return null;
  let m = roomId.match(/^group:(\d+)$/);
  if (m) return { kind: 'group', groupId: Number(m[1]) };
  m = roomId.match(/^dm:(\d+):(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a >= b || (uid !== a && uid !== b)) return null;
    return { kind: 'dm', otherId: uid === a ? b : a };
  }
  return null;
};

exports.roomOfMessage = (m) =>
  m.group_id ? exports.groupRoom(m.group_id) : exports.dmRoom(m.sender_id, m.receiver_id);
