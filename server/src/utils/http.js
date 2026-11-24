// Bọc handler async để lỗi được chuyển vào error middleware (Express 4 không tự bắt)
exports.h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.httpErr = (status, message, extra = {}) => Object.assign(new Error(message), { status }, extra);
