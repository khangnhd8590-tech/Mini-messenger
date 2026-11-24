import './globals.css';

export const metadata = { title: 'POP', description: 'POP - ứng dụng chat nội bộ' };

// Chạy trước khi paint để tránh nháy sáng/tối khi tải trang
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full bg-white text-slate-900 antialiased transition-colors dark:bg-slate-900 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
