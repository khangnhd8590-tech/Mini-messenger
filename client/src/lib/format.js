import { format, isToday, isYesterday } from 'date-fns';

export const fmtTime = (d) => format(new Date(d), 'HH:mm');
export const fmtFull = (d) => format(new Date(d), 'HH:mm dd/MM/yyyy');
export const fmtDay = (d) => {
  const x = new Date(d);
  return isToday(x) ? 'Hôm nay' : isYesterday(x) ? 'Hôm qua' : format(x, 'dd/MM/yyyy');
};
export const fmtListTime = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return isToday(x) ? format(x, 'HH:mm') : isYesterday(x) ? 'Hôm qua' : format(x, 'dd/MM');
};
export const fmtSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(2)} GB`;
};
export const previewOf = (m) =>
  m.recalled_at ? 'Tin nhắn đã được thu hồi' :
  m.type === 'image' ? '🖼 Ảnh' : m.type === 'video' ? '🎬 Video' : m.type === 'file' ? '📎 Tệp đính kèm' : m.content;
