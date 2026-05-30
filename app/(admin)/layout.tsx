import type { Metadata } from 'next';
import '../globals.css';

// The admin dashboard is intentionally English-only and locale-free: it lives
// outside the next-intl middleware matcher and has its own minimal root layout
// (no Nav/Footer/InstallPrompt, no NextIntlClientProvider). Keeping it separate
// means /admin URLs never gain a /[locale] prefix.
export const metadata: Metadata = {
  title: 'Below OP — Admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('belowop-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
