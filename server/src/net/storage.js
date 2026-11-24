const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { log } = require('./log');

const MB = 1024 * 1024;
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const TMP_DIR = path.join(UPLOAD_DIR, 'tmp');

const LIMITS = {
  BLOCK_LIMIT: 5 * MB,                                   // video > 5MB bắt buộc chia chunk
  MAX_BLOCK: (Number(process.env.MAX_BLOCK_MB) || 100) * MB, // ảnh/file gửi nguyên khối
  MAX_VIDEO: (Number(process.env.MAX_VIDEO_MB) || 500) * MB, // video chia chunk
  MAX_CHUNK: 1 * MB,
};
const MAX_CHUNKS = 5000;

const SAFE_IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SAFE_VID = ['video/mp4', 'video/webm', 'video/quicktime'];

// Chỉ ảnh/video "an toàn" mới hiển thị inline; mọi thứ khác (html, svg, exe...) luôn bị ép tải xuống
const classify = (fileType) => ({
  type: SAFE_IMG.includes(fileType) ? 'image' : SAFE_VID.includes(fileType) ? 'video' : 'file',
  isVideoMime: fileType.startsWith('video/'),
});

const sanitizeName = (name) =>
  path.basename(String(name || 'file')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim().slice(0, 200) || 'file';

const storedNameFor = (fileName) =>
  crypto.randomUUID() + path.extname(fileName).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10);

// Ghi ra file tạm rồi rename (atomic) để không bao giờ có file dở dang trong uploads/
async function saveBuffer(buf, fileName) {
  const storedName = storedNameFor(fileName);
  const tmp = path.join(TMP_DIR, `${storedName}.tmp`);
  const full = path.join(UPLOAD_DIR, storedName);
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, full);
  return { storedName, full };
}

async function promoteTmp(tmpPath, fileName) {
  const storedName = storedNameFor(fileName);
  const full = path.join(UPLOAD_DIR, storedName);
  await fs.promises.rename(tmpPath, full);
  return { storedName, full };
}

// Chạy khi server khởi động: tạo thư mục, dọn file tạm của các lần upload dang dở (server crash/restart)
function init() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(TMP_DIR)) { fs.unlinkSync(path.join(TMP_DIR, f)); n++; }
  if (n) log('STORAGE', `đã dọn ${n} file tạm của upload dang dở`);
}

module.exports = { UPLOAD_DIR, TMP_DIR, LIMITS, MAX_CHUNKS, classify, sanitizeName, saveBuffer, promoteTmp, init };
