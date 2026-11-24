'use client';
import { WifiOff } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { reconnectNow } from '@/store/chat';

export default function NetBanner() {
  const net = useStore((s) => s.net);
  if (net.state === 'online' || net.state === 'connecting') return null;

  const failed = net.state === 'failed';
  const replaced = net.state === 'replaced';
  const text = replaced
    ? 'POP đang được mở ở tab/thiết bị khác nên phiên này đã bị ngắt.'
    : failed
      ? 'Không kết nối lại được với máy chủ.'
      : `Mất kết nối. Đang tự kết nối lại${net.attempt ? ` (lần ${net.attempt})` : ''}… Tin đang gửi sẽ được gửi tiếp sau khi có mạng.`;

  return (
    <div className={`flex items-center justify-center gap-3 px-4 py-2 text-sm ${failed || replaced ? 'bg-red-600 text-white' : 'bg-amber-400 text-slate-900'}`}>
      <WifiOff size={16} />
      <span>{text}</span>
      {(failed || replaced) && (
        <button onClick={reconnectNow} className="rounded-full bg-white/90 px-3 py-0.5 font-medium text-slate-900 hover:bg-white">
          {replaced ? 'Dùng POP ở đây' : 'Kết nối lại'}
        </button>
      )}
    </div>
  );
}
