import { getSocket } from './socket';

const MB = 1024 * 1024;

export const NET = {
  BLOCK_LIMIT: 5 * MB,        // video > 5MB phải chia chunk
  MAX_BLOCK: 100 * MB,        // ảnh/file gửi nguyên khối (khớp MAX_BLOCK_MB của server)
  MAX_VIDEO: 500 * MB,        // video chia chunk (khớp MAX_VIDEO_MB của server)
  CHUNK_SIZE: 512 * 1024,     // 512KB / chunk
  MAX_RETRIES: 3,             // gửi lại tối đa 3 lần sau lần đầu
  TEXT_ACK_TIMEOUT: 4000,
  CHUNK_ACK_TIMEOUT: 8000,
  MAX_OFFLINE_WAIT: 90000,    // chờ reconnect tối đa 90s trước khi báo thất bại
};

// Thời gian chờ ACK cho gói nguyên khối: nền 8s + 2s mỗi MB (tối đa 2 phút)
export const ackTimeoutFor = (bytes) => Math.min(120000, 8000 + Math.ceil(bytes / MB) * 2000);

/* ----------------------------- Log (F12 Console) ----------------------------- */
const ts = () => new Date().toISOString().slice(11, 23);
export const clog = (tag, ...a) => console.log(`%c[${tag}]`, 'color:#0084ff;font-weight:bold', ts(), ...a);
export const cwarn = (tag, ...a) => console.warn(`%c[${tag}]`, 'color:#d97706;font-weight:bold', ts(), ...a);

/* ----------------------------- ID ----------------------------- */
let counter = 0;
// Chỉ gồm [a-z0-9-] để khớp validate của server. sequence_id/upload_id là duy nhất toàn cục.
export const newId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// roomId chuẩn: nhóm "group:<id>", 1-1 "dm:<idNhỏ>:<idLớn>"
export const roomIdOf = (kind, id, myId) =>
  kind === 'group' ? `group:${id}` : `dm:${Math.min(id, myId)}:${Math.max(id, myId)}`;

/* ----------------------------- Emit tin cậy: ACK + Retry ----------------------------- */
export class NetError extends Error {
  constructor(code, message, res) { super(message); this.code = code; this.res = res; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Đợi socket kết nối (không tính vào số lần retry). Khi mất mạng, gói chờ rồi tự gửi tiếp sau reconnect.
export function whenConnected(maxWait = NET.MAX_OFFLINE_WAIT) {
  const s = getSocket();
  if (!s) return Promise.reject(new NetError('offline', 'Chưa khởi tạo kết nối'));
  if (s.connected) return Promise.resolve(s);
  clog('WAIT', 'đang mất kết nối → giữ gói lại, gửi tiếp ngay khi reconnect');
  return new Promise((resolve, reject) => {
    const onConnect = () => { clearTimeout(t); resolve(s); };
    const t = setTimeout(() => {
      s.off('connect', onConnect);
      reject(new NetError('offline', 'Mất kết nối quá lâu, chưa gửi được'));
    }, maxWait);
    s.once('connect', onConnect);
  });
}

/**
 * Gửi `event` và chờ ACK. Chưa có ACK trong timeoutMs -> gửi lại (tối đa `retries` lần).
 * Server dùng sequence_id để xử lý idempotent nên gửi lại là an toàn (không bị ghi trùng).
 * onState(status, attempt): 'pending' (lần đầu) | 'retrying' (lần gửi lại thứ `attempt`)
 */
export async function reliableEmit(event, payload, { timeoutMs = 5000, retries = NET.MAX_RETRIES, label = event, onState } = {}) {
  let attempt = 0;
  for (;;) {
    const s = await whenConnected();
    attempt += 1;
    onState?.(attempt === 1 ? 'pending' : 'retrying', attempt - 1);
    const t0 = performance.now();
    clog('SEND', `${label} [${event}] lần ${attempt}/${retries + 1} timeout=${timeoutMs}ms`);

    const res = await new Promise((resolve) =>
      s.timeout(timeoutMs).emit(event, payload, (err, r) => resolve(err ? { __timeout: true } : r)));

    if (res && res.__timeout) {
      if (attempt > retries) throw new NetError('timeout', `Không nhận được ACK sau ${attempt} lần gửi`);
      cwarn('RETRY', `${label}: hết ${timeoutMs}ms chưa có ACK → gửi lại (${attempt}/${retries})`);
      await sleep(300 * attempt);
      continue;
    }
    if (res && res.ok) {
      clog('ACK', `${label} ${res.type || ''}${res.duplicate ? ' (duplicate: server đã xử lý trước đó)' : ''} sau ${(performance.now() - t0).toFixed(0)}ms`);
      return res;
    }
    cwarn('REJECT', `${label}: server từ chối "${res?.error}" ${res?.code ? `(${res.code})` : ''}`);
    throw new NetError('server', res?.error || 'Server từ chối', res);
  }
}
