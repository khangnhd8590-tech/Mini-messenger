// Logo POP: bong bóng chat trắng trên nền xanh gradient kiểu Messenger, ba chấm lớn dần = "pop pop pop"
export default function Logo({ size = 44, withText = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="POP">
        <defs>
          <linearGradient id="pop-grad" x1="0" y1="64" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0062ff" />
            <stop offset="1" stopColor="#00b2ff" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill="url(#pop-grad)" />
        <path d="M32 11C20.4 11 11.5 19.5 11.5 30.2c0 5.7 2.5 10.7 6.5 14.2v6.6a1.2 1.2 0 0 0 1.8 1l6.2-3.4c2 .5 4 .8 6 .8 11.6 0 20.5-8.5 20.5-19.2S43.6 11 32 11z" fill="#fff" />
        <circle cx="22" cy="30.5" r="3" fill="#0a6fe0" />
        <circle cx="32" cy="30.5" r="4" fill="#0a6fe0" />
        <circle cx="43" cy="30.5" r="5" fill="#0a6fe0" />
      </svg>
      {withText && <span className="text-2xl font-extrabold tracking-tight text-brand-600 dark:text-brand-400">POP</span>}
    </span>
  );
}
