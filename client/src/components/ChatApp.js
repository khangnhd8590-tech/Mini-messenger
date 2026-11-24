'use client';
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useChatSocket } from '@/hooks/useChatSocket';
import { keyOf } from '@/store/chat';
import Sidebar from './Sidebar';
import ConversationList from './ConversationList';
import ChatWindow from './ChatWindow';
import GroupModal from './GroupModal';
import Toasts from './Toasts';
import NetBanner from './NetBanner';
import Logo from './Logo';

export default function ChatApp() {
  useChatSocket();
  const active = useStore((s) => s.active);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <NetBanner />
      <div className="flex min-h-0 flex-1">
      <Sidebar />
      <ConversationList onNewGroup={() => setCreating(true)} />
      <main className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {active ? (
          <ChatWindow key={keyOf(active)} />
        ) : (
          <div className="grid h-full place-items-center text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <Logo size={72} withText />
              <span>Chọn một cuộc trò chuyện để bắt đầu</span>
            </div>
          </div>
        )}
      </main>
      </div>
      {creating && <GroupModal mode="create" onClose={() => setCreating(false)} />}
      <Toasts />
    </div>
  );
}
