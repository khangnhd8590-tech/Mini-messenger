const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  let token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  // <img>/<video>/<a download> không gửi được header -> chỉ route /api/files cho phép ?token=
  if (!token && req.baseUrl === '/api/files') token = req.query.token;
  try {
    req.user = { id: jwt.verify(token, process.env.JWT_SECRET).id };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
