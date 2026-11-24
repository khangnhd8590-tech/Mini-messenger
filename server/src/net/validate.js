const { httpErr } = require('../utils/http');
const { sanitizeName } = require('./storage');

const ID_RE = /^[\w.-]{8,100}$/;

exports.needSeq = (v) => {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw httpErr(400, 'sequence_id không hợp lệ', { code: 'bad_sequence' });
  return v;
};
exports.needId = (v, name) => {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw httpErr(400, `${name} không hợp lệ`, { code: 'bad_id' });
  return v;
};

exports.checkMeta = (p) => {
  const fileSize = Number(p.fileSize);
  if (!Number.isInteger(fileSize) || fileSize <= 0) throw httpErr(400, 'fileSize không hợp lệ', { code: 'bad_meta' });
  return {
    fileName: sanitizeName(p.fileName),
    fileType: (String(p.fileType || '').toLowerCase().slice(0, 100)) || 'application/octet-stream',
    fileSize,
  };
};

// Socket.io trả dữ liệu nhị phân về Buffer; vẫn chấp nhận ArrayBuffer/TypedArray cho chắc
exports.toBuffer = (d) => {
  if (Buffer.isBuffer(d)) return d;
  if (d instanceof ArrayBuffer) return Buffer.from(d);
  if (ArrayBuffer.isView(d)) return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
  return null;
};
