// Bảng định tuyến trên RAM: Map<userId, socketId> cho các user đang online.
// Mỗi user có tối đa 1 phiên đang hoạt động (kết nối mới sẽ thay thế kết nối cũ).
const table = new Map();

exports.register = (uid, sid) => { const prev = table.get(uid); table.set(uid, sid); return prev; };

// Chỉ xóa nếu đúng socket hiện hành (tránh socket cũ vừa bị thay thế xóa nhầm entry của socket mới)
exports.unregister = (uid, sid) => {
  if (table.get(uid) !== sid) return false;
  table.delete(uid);
  return true;
};
exports.getSocketId = (uid) => table.get(uid);
exports.isOnline = (uid) => table.has(uid);
exports.onlineIds = () => [...table.keys()];
exports.size = () => table.size;
exports.clear = () => table.clear();

// Gửi riêng cho 1 user qua socketId trong bảng (id của socket cũng là một room mặc định)
exports.emitTo = (io, uid, event, payload) => {
  const sid = table.get(uid);
  if (!sid) return false;
  io.to(sid).emit(event, payload);
  return true;
};

// Gửi cho các user đang online (dùng cho presence); trả về số client đã nhận
exports.emitToOnline = (io, event, payload, exceptUid) => {
  let n = 0;
  for (const [uid, sid] of table) {
    if (uid === exceptUid) continue;
    io.to(sid).emit(event, payload);
    n++;
  }
  return n;
};

// Cho socket hiện hành của user vào một room
exports.joinRoom = (io, uid, room) => {
  const sid = table.get(uid);
  if (sid) io.in(sid).socketsJoin(room);
};
