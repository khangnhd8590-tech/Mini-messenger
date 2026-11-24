// Truyền ảnh / video / file qua Socket.io (nhị phân) kèm sequence_id, ACK, Idempotency.
//  - file:send     : ảnh, file bất kỳ, video <= 5MB  -> gửi NGUYÊN KHỐI
//  - upload:chunk  : video > 5MB                      -> gửi theo từng CHUNK (stop-and-wait)
const fs = require('fs');
const path = require('path');
const { httpErr } = require('../utils/http');
const { createMessage, findBySequence } = require('../services/messages');
const { authRoom } = require('./room-auth');
const { once } = require('./idempotency');
const { log, warn, fmtBytes } = require('./log');
const { needSeq, needId, checkMeta, toBuffer } = require('./validate');
const S = require('./storage');

const IDLE_MS = 120000;             // upload im lặng 2 phút -> hủy, xóa file tạm
const sessions = new Map();         // upload_id -> phiên upload đang chạy
const completed = new Map();        // upload_id -> { uid, msg }  (để re-ACK khi VIDEO_ACK bị mất)

const targetOf = (r) => (r.kind === 'group' ? { groupId: r.groupId } : { to: r.otherId });
const ackBody = (type, seq, msg, duplicate, extra = {}) =>
  ({ ok: true, type, sequence_id: seq, duplicate: !!duplicate, message: msg, done: false, ...extra });
const parseReply = (v) => parseInt(v, 10) || null;

function dropSession(id, why) {
  const s = sessions.get(id);
  if (!s) return;
  clearTimeout(s.timer);
  sessions.delete(id);
  s.handlePromise.then((h) => h.close()).catch(() => {}).finally(() => fs.unlink(s.tmpPath, () => {}));
  warn('UPLOAD', `hủy phiên up=${id.slice(0, 12)} (${why}), đã xóa file tạm`);
}
const touch = (s) => {
  clearTimeout(s.timer);
  s.timer = setTimeout(() => dropSession(s.id, 'quá hạn không có chunk mới'), IDLE_MS);
};
// Mutex theo từng phiên: chunk gốc và bản retry của nó không bao giờ ghi chồng lên nhau
const withLock = (s, fn) => {
  const run = s.lock.then(fn);
  s.lock = run.catch(() => {});
  return run;
};
async function writeFully(handle, buf, pos) {
  let off = 0;
  while (off < buf.length) {
    const { bytesWritten } = await handle.write(buf, off, buf.length - off, pos + off);
    off += bytesWritten;
  }
}

module.exports = function registerTransfer(io, socket, onRaw) {
  const uid = socket.userId;
  const who = `${socket.username}(#${uid})`;

  /* ======================= GỬI NGUYÊN KHỐI ======================= */
  onRaw('file:send', async (p) => {
    const t0 = Date.now();
    const seq = needSeq(p.sequence_id);
    const r = await authRoom(uid, p.roomId);
    const meta = checkMeta(p);
    const buf = toBuffer(p.data);
    if (!buf || !buf.length) throw httpErr(400, 'Thiếu dữ liệu nhị phân', { code: 'no_data' });
    log('RECV', `file:send seq=${seq} ${who} "${meta.fileName}" ${meta.fileType} khai báo=${fmtBytes(meta.fileSize)} nhận=${fmtBytes(buf.length)}`);

    if (buf.length !== meta.fileSize)
      throw httpErr(400, `Kích thước không khớp (khai báo ${meta.fileSize}, nhận ${buf.length})`, { code: 'size_mismatch' });
    if (buf.length > S.LIMITS.MAX_BLOCK)
      throw httpErr(413, `File quá lớn (tối đa ${fmtBytes(S.LIMITS.MAX_BLOCK)} khi gửi nguyên khối)`, { code: 'too_large' });

    const cls = S.classify(meta.fileType);
    if (cls.isVideoMime && buf.length > S.LIMITS.BLOCK_LIMIT)
      throw httpErr(400, 'Video lớn hơn 5MB phải gửi theo từng đoạn (upload:chunk)', { code: 'use_chunked' });

    const big = buf.length > S.LIMITS.BLOCK_LIMIT;
    log('ROUTE', `${cls.type}${cls.isVideoMime ? ' (video ≤5MB)' : ''} ${fmtBytes(buf.length)} ${big ? '> 5MB' : '≤ 5MB'} → nguyên khối nhị phân${big && !cls.isVideoMime ? ' (file nặng: lưu có thể lâu)' : ''}`);

    const res = await once(`${uid}:${seq}`, async () => {
      // Idempotency: kiểm tra TRƯỚC khi ghi file xuống đĩa
      const existing = await findBySequence(uid, seq);
      if (existing) {
        log('IDEMPOTENT', `seq=${seq} đã xử lý (msg #${existing.id}) → bỏ qua ghi file/DB, chỉ gửi lại ACK`);
        return { msg: existing, duplicate: true };
      }
      const t1 = Date.now();
      const { storedName, full } = await S.saveBuffer(buf, meta.fileName);
      log('STORAGE', `đã lưu ${storedName} (${fmtBytes(buf.length)}) trong ${Date.now() - t1}ms`);
      try {
        const out = await createMessage(io, uid, {
          ...targetOf(r), sequence_id: seq, replyToId: parseReply(p.replyToId), type: cls.type,
          fileName: meta.fileName, fileSize: meta.fileSize, filePath: storedName, fileMime: meta.fileType,
        }, { socket });
        if (out.duplicate) fs.unlink(full, () => {});
        return out;
      } catch (e) { fs.unlink(full, () => {}); throw e; }
    });

    log('ACK', `file:send seq=${seq} → ACK${res.duplicate ? ' (duplicate)' : ''} msg #${res.msg.id} | tổng ${Date.now() - t0}ms`);
    return ackBody('ACK', seq, res.msg, res.duplicate);
  });

  /* ======================= VIDEO > 5MB: CHIA CHUNK ======================= */
  onRaw('upload:chunk', async (p) => {
    const uploadId = needId(p.upload_id, 'upload_id');
    const seq = needSeq(p.sequence_id);
    const idx = Number(p.chunk_index);
    const total = Number(p.total_chunks);
    if (!Number.isInteger(idx) || !Number.isInteger(total) || total < 1 || total > S.MAX_CHUNKS || idx < 0 || idx >= total)
      throw httpErr(400, 'chunk_index/total_chunks không hợp lệ', { code: 'bad_chunk' });
    const meta = checkMeta(p);
    if (meta.fileSize > S.LIMITS.MAX_VIDEO)
      throw httpErr(413, `Video quá lớn (tối đa ${fmtBytes(S.LIMITS.MAX_VIDEO)})`, { code: 'too_large' });
    const buf = toBuffer(p.data);
    if (!buf || !buf.length || buf.length > S.LIMITS.MAX_CHUNK)
      throw httpErr(400, 'Chunk rỗng hoặc quá lớn', { code: 'bad_chunk' });
    const r = await authRoom(uid, p.roomId);
    const tag = `up=${uploadId.slice(0, 12)}`;

    // (1) Upload này đã hoàn tất trước đó (client retry vì mất VIDEO_ACK) -> chỉ re-ACK
    const done = completed.get(uploadId);
    if (done && done.uid === uid) {
      log('IDEMPOTENT', `${tag} đã hoàn tất trước đó → chỉ gửi lại ACK, không ghi lại`);
      return ackBody('CHUNK_ACK', seq, done.msg, true, { upload_id: uploadId, chunk_index: idx, next: total, done: true });
    }

    let s = sessions.get(uploadId);
    if (!s) {
      // (2) sequence_id đã được xử lý ở lần trước (vd server vừa restart sau khi lưu xong)
      const existing = await findBySequence(uid, seq);
      if (existing) {
        log('IDEMPOTENT', `${tag} seq=${seq} đã có msg #${existing.id} → bỏ qua upload, chỉ ACK`);
        return ackBody('CHUNK_ACK', seq, existing, true, { upload_id: uploadId, chunk_index: idx, next: total, done: true });
      }
      s = sessions.get(uploadId); // có thể vừa được tạo bởi yêu cầu song song
    }
    if (!s) {
      if (idx !== 0)
        throw httpErr(409, 'Phiên upload không tồn tại (server restart/hết hạn) → bắt đầu lại từ chunk 0', { code: 'no_session', expected: 0 });
      const tmpPath = path.join(S.TMP_DIR, `${uploadId}.part`);
      s = {
        id: uploadId, uid, seq, roomId: p.roomId, ...meta, total, next: 0, bytes: 0, tmpPath,
        replyToId: parseReply(p.replyToId), lock: Promise.resolve(), timer: null,
        handlePromise: fs.promises.open(tmpPath, 'w'), t0: Date.now(),
      };
      s.handlePromise.catch(() => {});
      sessions.set(uploadId, s); // đồng bộ, trước mọi await -> chunk 0 song song không tạo trùng phiên
      log('ROUTE', `video ${fmtBytes(meta.fileSize)} > 5MB → chia chunk: ${total} đoạn | ${tag} ${who} "${meta.fileName}"`);
    }
    if (s.uid !== uid) throw httpErr(403, 'Không có quyền với phiên upload này', { code: 'forbidden' });

    return withLock(s, async () => {
      if (meta.fileSize !== s.fileSize || total !== s.total || seq !== s.seq)
        throw httpErr(400, 'Metadata không khớp phiên upload', { code: 'meta_mismatch' });
      touch(s);

      // Chống trùng đoạn theo upload_id + chunk_index
      if (idx < s.next) {
        warn('IDEMPOTENT', `${tag} chunk ${idx + 1}/${total} đã nhận → không ghi lại, chỉ gửi lại CHUNK_ACK`);
        return ackBody('CHUNK_ACK', seq, null, true, { upload_id: uploadId, chunk_index: idx, next: s.next });
      }
      // Ghi nối tiếp: chỉ nhận đúng đoạn kế tiếp
      if (idx > s.next)
        throw httpErr(409, `Chunk sai thứ tự (cần #${s.next})`, { code: 'out_of_order', expected: s.next });
      if (s.bytes + buf.length > s.fileSize) {
        dropSession(uploadId, 'vượt quá fileSize khai báo');
        throw httpErr(400, 'Dữ liệu vượt quá fileSize khai báo', { code: 'size_mismatch', expected: 0 });
      }

      await writeFully(await s.handlePromise, buf, s.bytes);
      s.bytes += buf.length;
      s.next += 1;
      log('CHUNK', `${tag} chunk ${idx + 1}/${total} (${fmtBytes(buf.length)}) → ${fmtBytes(s.bytes)}/${fmtBytes(s.fileSize)} (${Math.round((s.bytes / s.fileSize) * 100)}%)`);

      if (s.next < s.total)
        return ackBody('CHUNK_ACK', seq, null, false, { upload_id: uploadId, chunk_index: idx, next: s.next });

      /* ----- đủ total_chunks: ghép file, lưu DB, multicast, VIDEO_ACK ----- */
      await (await s.handlePromise).close();
      clearTimeout(s.timer);
      sessions.delete(uploadId);
      if (s.bytes !== s.fileSize) {
        fs.unlink(s.tmpPath, () => {});
        throw httpErr(422, `Ghép file lỗi: ${s.bytes}/${s.fileSize} bytes`, { code: 'size_mismatch', expected: 0 });
      }
      const { storedName, full } = await S.promoteTmp(s.tmpPath, s.fileName);
      const cls = S.classify(s.fileType);
      let out;
      try {
        out = await once(`${uid}:${seq}`, () => createMessage(io, uid, {
          ...targetOf(r), sequence_id: seq, replyToId: s.replyToId, type: cls.type,
          fileName: s.fileName, fileSize: s.fileSize, filePath: storedName, fileMime: s.fileType,
        }, { socket }));
      } catch (e) { fs.unlink(full, () => {}); throw e; }
      if (out.duplicate) fs.unlink(full, () => {});

      completed.set(uploadId, { uid, msg: out.msg });
      setTimeout(() => completed.delete(uploadId), 10 * 60 * 1000).unref();

      const payload = { type: 'VIDEO_ACK', upload_id: uploadId, sequence_id: seq, message: out.msg };
      socket.emit('VIDEO_ACK', payload);
      log('VIDEO_ACK', `${tag} ghép đủ ${total} chunk, ${fmtBytes(s.fileSize)} trong ${Date.now() - s.t0}ms → msg #${out.msg.id}`);
      return ackBody('CHUNK_ACK', seq, out.msg, out.duplicate, { upload_id: uploadId, chunk_index: idx, next: total, done: true });
    });
  });
};
