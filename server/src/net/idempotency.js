const { log } = require('./log');

// Chống xử lý song song cùng một sequence_id (client retry khi bản gốc còn đang xử lý).
// Việc chống trùng lâu dài do UNIQUE(sender_id, sequence_id) trong PostgreSQL đảm nhiệm.
const inflight = new Map();

exports.once = async (key, fn) => {
  const running = inflight.get(key);
  if (running) {
    log('IDEMPOTENT', `${key} đang được xử lý → chờ kết quả, KHÔNG xử lý/emit lại`);
    return { ...(await running), duplicate: true };
  }
  const p = Promise.resolve().then(fn);
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
};
