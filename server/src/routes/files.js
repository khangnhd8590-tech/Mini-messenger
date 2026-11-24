const router = require('express').Router();
const path = require('path');
const db = require('../db');
const auth = require('../middleware/auth');
const { h, httpErr } = require('../utils/http');
const { canAccessMessage } = require('../utils/permissions');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

// uploads/ KHÔNG public. Mọi file đều đi qua route này và được kiểm tra quyền theo tin nhắn.
router.get('/:id', auth, h(async (req, res) => {
  const m = await canAccessMessage(req.user.id, parseInt(req.params.id, 10));
  if (!m) throw httpErr(404, 'Không tìm thấy file');
  const f = (await db.query('SELECT file_path, file_name, type FROM messages WHERE id=$1', [m.id])).rows[0];
  if (!f || !f.file_path) throw httpErr(404, 'Không tìm thấy file');

  const full = path.join(UPLOAD_DIR, path.basename(f.file_path));
  if (req.query.download === '1' || f.type === 'file') return res.download(full, f.file_name);
  res.sendFile(full); // hỗ trợ Range -> tua video được
}));

module.exports = router;
