const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');
const { h, httpErr } = require('../utils/http');
const { createMessage } = require('../services/messages');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const SAFE_IMG = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const SAFE_VID = ['video/mp4', 'video/webm', 'video/quicktime'];

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    // Tên file ngẫu nhiên -> không đoán được, không ghi đè, không path traversal
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10)),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// POST /api/upload  (multipart: file, to | groupId, replyToId?)
router.post('/', auth, upload.single('file'), h(async (req, res) => {
  const f = req.file;
  if (!f) throw httpErr(400, 'Thiếu file');
  try {
    const b = req.body;
    // Chỉ ảnh/video an toàn mới hiển thị inline; mọi thứ khác (html, svg, exe...) luôn bị ép tải xuống
    const type = SAFE_IMG.includes(f.mimetype) ? 'image' : SAFE_VID.includes(f.mimetype) ? 'video' : 'file';
    const msg = await createMessage(req.app.get('io'), req.user.id, {
      to: b.to ? parseInt(b.to, 10) : null,
      groupId: b.groupId ? parseInt(b.groupId, 10) : null,
      replyToId: b.replyToId ? parseInt(b.replyToId, 10) : null,
      type,
      fileName: Buffer.from(f.originalname, 'latin1').toString('utf8'), // sửa lỗi font tiếng Việt
      fileSize: f.size,
      filePath: f.filename,
      fileMime: f.mimetype,
    });
    res.json(msg);
  } catch (e) {
    fs.unlink(f.path, () => {}); // lỗi quyền/validate -> xoá file vừa lưu
    throw e;
  }
}));

module.exports = router;
