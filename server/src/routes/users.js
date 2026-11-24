const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { h } = require('../utils/http');

router.get('/', auth, h(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, username, status, last_seen FROM users WHERE id <> $1 ORDER BY username', [req.user.id]);
  res.json(rows);
}));

module.exports = router;
