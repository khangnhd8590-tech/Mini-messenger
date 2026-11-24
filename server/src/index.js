require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const db = require('./db');
const routing = require('./net/routing');
const storage = require('./net/storage');
const { log, warn, fmtBytes } = require('./net/log');

const PORT = process.env.PORT || 4000;
const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim());

// Native keepalive của Socket.io/Engine.IO: server tự gửi ping mỗi pingInterval và
// chờ pong trong pingTimeout. Quá hạn -> tự đóng socket và phát sự kiện 'disconnect'
// (rút dây mạng, tắt tab/trình duyệt, treo máy...). KHÔNG dùng setInterval thủ công.
const PING_INTERVAL = Number(process.env.PING_INTERVAL) || 5000;
const PING_TIMEOUT = Number(process.env.PING_TIMEOUT) || 10000;

storage.init();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: origins },
  transports: ['websocket'],
  pingInterval: PING_INTERVAL,
  pingTimeout: PING_TIMEOUT,
  // Mỗi gói (một lần emit) tối đa: file gửi nguyên khối + overhead
  maxHttpBufferSize: storage.LIMITS.MAX_BLOCK + 1024 * 1024,
});
app.set('io', io);
io.engine.on('connection_error', (err) => warn('ENGINE', `lỗi kết nối: ${err.code} ${err.message}`));

// Client (port 3000) tải ảnh/video từ server (port 4000) -> phải cho phép cross-origin resource
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/files', require('./routes/files'));   // tải/xem file (có kiểm tra quyền); upload đi qua Socket.io

// Error handler tập trung
app.use((err, req, res, next) => {
  if (err.name === 'ZodError') return res.status(400).json({ error: err.issues[0].message });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Lỗi máy chủ' });
});

require('./sockets')(io);

// Khi tắt server bình thường: đưa mọi user về offline
let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  warn('SHUTDOWN', `nhận ${sig} → đưa mọi user về offline rồi thoát`);
  try { await db.query("UPDATE users SET status='offline'"); } catch {}
  routing.clear();
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

(async () => {
  try {
    // Server crash/restart: RAM mất hết -> reset DB về offline để không kẹt "online".
    // Trạng thái online sẽ được dựng lại khi từng user xác thực và kết nối lại.
    const r = await db.query("UPDATE users SET status='offline'");
    log('BOOT', `đã reset ${r.rowCount} user về offline (chờ client tự reconnect)`);
  } catch (e) {
    console.error('❌ Không kết nối được PostgreSQL:', e.message);
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`✅ Server chạy tại http://localhost:${PORT}`);
    log('CONFIG', `pingInterval=${PING_INTERVAL}ms pingTimeout=${PING_TIMEOUT}ms → phát hiện mất kết nối trong ≤ ${(PING_INTERVAL + PING_TIMEOUT) / 1000}s`);
    log('CONFIG', `nguyên khối ≤ ${fmtBytes(storage.LIMITS.MAX_BLOCK)} | video > ${fmtBytes(storage.LIMITS.BLOCK_LIMIT)} chia chunk, tối đa ${fmtBytes(storage.LIMITS.MAX_VIDEO)}`);
    if (Number(process.env.NET_CHAOS_DROP_ACK)) warn('CHAOS', `đang bật làm rơi ACK với xác suất ${process.env.NET_CHAOS_DROP_ACK}`);
  });
})();
