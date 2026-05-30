import { defineRouting } from 'next-intl/routing';

// Below OP supports English (default, at the root path) and Arabic (under
// /ar, rendered RTL). `as-needed` keeps every existing English URL exactly as
// it was — '/', '/about', '/privacy', '?inquire=u-xxx' — so no shared links,
// OG cards, or bookmarks break. Arabic gets the '/ar' prefix.
export const routing = defineRouting({
  locales: ['en', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'as-needed',
});

export type AppLocale = (typeof routing.locales)[number];
