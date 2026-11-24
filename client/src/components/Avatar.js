const COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-sky-500', 'bg-brand-500', 'bg-fuchsia-500'];

export default function Avatar({ name = '?', size = 40, online = false, group = false }) {
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={`${color} grid h-full w-full place-items-center rounded-full font-semibold text-white`}
        style={{ fontSize: size * 0.42 }}>
        {group ? '👥' : (name[0] || '?').toUpperCase()}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-slate-900" />
      )}
    </div>
  );
}
