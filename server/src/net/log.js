const ts = () => new Date().toISOString().slice(11, 23);
const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (n < 1024) return `${n}B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)}MB`;
  return `${(n / 1073741824).toFixed(2)}GB`;
};
const out = (fn) => (tag, msg) => fn(`${ts()} [${String(tag).padEnd(10)}] ${msg}`);

module.exports = { log: out(console.log), warn: out(console.warn), fmtBytes };
