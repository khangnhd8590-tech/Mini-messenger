'use client';
import { useEffect, useState } from 'react';

const split = (s) => s.split(' ');
const CATEGORIES = [
  { icon: '😀', name: 'Mặt cười', list: split('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖') },
  { icon: '👍', name: 'Cử chỉ', list: split('👍 👎 👌 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ✋ 🤚 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 🙋 🤷 🤦 🙇 💃 🕺 👀 🧠') },
  { icon: '❤️', name: 'Trái tim & biểu tượng', list: split('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💤 🔥 ✨ ⭐ 🌟 🎉 🎊 ✅ ❌ ❓ ❗') },
  { icon: '🐶', name: 'Động vật & đồ ăn', list: split('🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐢 🐍 🐙 🐬 🐳 🦋 🌸 🌹 🌻 🌲 🍎 🍌 🍉 🍇 🍓 🍒 🍑 🥑 🍅 🌽 🍕 🍔 🍟 🌭 🍜 🍣 🍰 🎂 🍫 🍿 🍩 🍪 ☕ 🍵 🍺 🍷 🥤') },
  { icon: '⚽', name: 'Hoạt động & đồ vật', list: split('⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🎮 🎯 🎲 🎵 🎶 🎤 🎧 🎸 📱 💻 📷 🎬 📚 📌 📎 🔑 🔒 💡 🎁 ⏰ 🚗 ✈️ 🚀 🏠 🌈 ☀️ 🌙 ❄️') },
];

export default function EmojiPicker({ onPick, onClose }) {
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* lớp nền trong suốt: bấm ra ngoài để đóng */}
      <div className="fixed inset-0 z-30" onClick={onClose} />
      {/* onMouseDown preventDefault: bấm emoji không làm ô nhập mất focus */}
      <div onMouseDown={(e) => e.preventDefault()}
        className="absolute bottom-full left-3 z-40 mb-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <div className="flex border-b border-slate-100 dark:border-slate-700">
          {CATEGORIES.map((c, i) => (
            <button key={c.name} title={c.name} onClick={() => setTab(i)}
              className={`flex-1 py-2 text-lg ${i === tab ? 'border-b-2 border-brand-500' : 'opacity-60 hover:opacity-100'}`}>
              {c.icon}
            </button>
          ))}
        </div>
        <div className="px-3 pb-1 pt-2 text-xs text-slate-400">{CATEGORIES[tab].name}</div>
        <div className="grid h-52 grid-cols-8 content-start gap-0.5 overflow-y-auto px-2 pb-2">
          {CATEGORIES[tab].list.map((e) => (
            <button key={e} onClick={() => onPick(e)}
              className="grid h-9 w-9 place-items-center rounded-lg text-xl hover:bg-slate-100 dark:hover:bg-slate-700">{e}</button>
          ))}
        </div>
      </div>
    </>
  );
}
