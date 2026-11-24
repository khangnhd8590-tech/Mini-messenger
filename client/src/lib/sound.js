// Âm thanh nhẹ nhàng tạo bằng Web Audio API (không cần file mp3).
// Trình duyệt chỉ cho phát sau khi người dùng đã tương tác với trang.
let ctx;

const PATTERNS = {
  send:    [[660, 0, 0.08]],
  receive: [[880, 0, 0.09], [1175, 0.09, 0.12]],
  mention: [[988, 0, 0.09], [1319, 0.1, 0.09], [1760, 0.2, 0.14]],
};

export function playSound(kind) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    PATTERNS[kind].forEach(([freq, start, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.exponentialRampToValueAtTime(0.06, t + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + dur + 0.02);
    });
  } catch {}
}
