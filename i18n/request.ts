import { getRequestConfig } from 'next-intl/server';
import { routing, type AppLocale } from './routing';

// Request-scoped config: resolves the active locale (set by middleware) and
// loads the matching message catalogue. Falls back to the default locale for
// any unknown/missing value so a bad URL can never 500 the page.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = routing.locales.includes(requested as AppLocale)
    ? (requested as AppLocale)
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
