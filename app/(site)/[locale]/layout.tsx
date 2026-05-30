import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import '../../globals.css';
import { routing, type AppLocale } from '@/i18n/routing';
import { cairo } from '@/lib/fonts';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import InstallPrompt from '@/components/InstallPrompt';

// Pre-render both locales at build time. With localePrefix: 'as-needed' the
// default (en) is served at '/', Arabic at '/ar'.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata.home' });
  return {
    metadataBase: new URL('https://belowop-demo.vercel.app'),
    title: t('title'),
    description: t('description'),
    manifest: '/manifest.json',
    // hreflang: tell search engines the EN root and the /ar variant are the
    // same content in different languages. localePrefix 'as-needed' keeps EN
    // at '/' (no '/en' prefix), so map it explicitly.
    alternates: {
      languages: {
        en: '/',
        ar: '/ar',
      },
    },
    icons: {
      icon: [
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: '/icons/icon-192.png',
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#0F766E',
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Reject anything that isn't a configured locale before doing any work.
  if (!routing.locales.includes(locale as AppLocale)) {
    notFound();
  }
  // Opt this branch into static rendering for the active locale.
  setRequestLocale(locale);

  const messages = await getMessages();
  const t = await getTranslations('a11y');
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    // cairo.variable is attached for every locale but only consumed by the
    // `[dir='rtl'] body` rule in globals.css, so the LTR site stays on its
    // existing Inter/system-ui stack and renders pixel-identically.
    <html lang={locale} dir={dir} className={cairo.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('belowop-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased">
        <NextIntlClientProvider messages={messages}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand"
          >
            {t('skipToContent')}
          </a>
          <Nav />
          <main id="main" className="min-h-[calc(100vh-180px)]">{children}</main>
          <Footer />
          <InstallPrompt />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
