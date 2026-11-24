const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { h } = require('../utils/http');

const creds = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Tên đăng nhập 3-30 ký tự: chữ, số hoặc dấu _'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự').max(100),
});
const sign = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', h(async (req, res) => {
  const { username, password } = creds.parse(req.body);
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users(username, password_hash) VALUES ($1,$2) RETURNING id, username', [username, hash]);
    res.json({ token: sign(rows[0]), user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại' });
    throw e;
  }
}));

router.post('/login', h(async (req, res) => {
  const { username, password } = creds.parse(req.body);
  const { rows } = await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  res.json({ token: sign(u), user: { id: u.id, username: u.username } });
}));

router.get('/me', auth, h(async (req, res) => {
  const { rows } = await db.query('SELECT id, username FROM users WHERE id=$1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: rows[0] });
}));

module.exports = router;
