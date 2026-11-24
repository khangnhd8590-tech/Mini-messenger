'use client';
import { FileText, Film, Image as ImageIcon, Loader2, RotateCcw, X } from 'lucide-react';
import { NET } from '@/lib/net';
import { fmtSize } from '@/lib/format';
import { dismissOutbox, retryOutbox } from '@/store/chat';

const ICONS = { image: ImageIcon, video: Film, file: FileText };

// Hiển thị trạng thái gửi: Pending -> Retrying -> (ACK: biến mất, tin thật xuất hiện) | Failed
export default function OutboxItem({ o }) {
  const failed = o.status === 'failed';
  const Icon = ICONS[o.type];
  const status = failed
    ? `Gửi thất bại: ${o.error}`
    : o.status === 'retrying'
      ? `Đang gửi lại (${o.attempt}/${NET.MAX_RETRIES})…`
      : o.progress != null
        ? `Đang gửi… ${o.progress}%`
        : 'Đang gửi (chờ ACK)…';

  return (
    <div className="mt-1 flex flex-row-reverse px-4">
      <div className="max-w-[75%]">
        <div className={`rounded-2xl px-3 py-2 text-sm ${failed ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' : 'bg-brand-600/70 text-white'}`}>
          {Icon ? (
            <div className="flex items-center gap-2">
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{o.label}</span>
              <span className="shrink-0 text-xs opacity-80">{fmtSize(o.size)}</span>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words">{o.label}</p>
          )}
          {o.progress != null && !failed && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full bg-white transition-all" style={{ width: `${o.progress}%` }} />
            </div>
          )}
        </div>
        <div className={`mt-0.5 flex items-center justify-end gap-2 px-1 text-[11px] ${failed ? 'text-red-500' : 'text-slate-400'}`}>
          {!failed && <Loader2 size={11} className="animate-spin" />}
          <span>{status}</span>
          {failed && (
            <>
              <button onClick={() => retryOutbox(o.id)} className="inline-flex items-center gap-1 font-medium underline"><RotateCcw size={11} /> Thử lại</button>
              <button onClick={() => dismissOutbox(o.id)} className="inline-flex items-center gap-1 underline"><X size={11} /> Hủy</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
