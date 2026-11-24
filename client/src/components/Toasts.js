'use client';
import { X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { closeToast, openConversation } from '@/store/chat';

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id}
          onClick={() => { if (t.conv) openConversation(t.conv); closeToast(t.id); }}
          className={`pointer-events-auto flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 shadow-lg dark:bg-slate-800 ${t.mention ? 'border-amber-400' : 'border-slate-200 dark:border-slate-700'}`}>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.mention && '🔔 '}{t.title}</div>
            {t.text && <div className="mt-0.5 line-clamp-2 text-sm text-slate-500">{t.text}</div>}
          </div>
          <button onClick={(e) => { e.stopPropagation(); closeToast(t.id); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
