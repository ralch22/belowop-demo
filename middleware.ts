import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Run only on public-site paths. Everything that must keep a fixed,
  // locale-free URL is excluded:
  //   - /api/*   webhook + data routes (Apify, leads, og, subscribe, …)
  //   - /admin/* internal dashboard (English-only, its own root layout)
  //   - /img/*   opaque image proxy
  //   - /_next, /_vercel internals
  //   - any path with a file extension (manifest.json, sw.js, icons, …)
  matcher: ['/((?!api|admin|img|_next|_vercel|.*\\..*).*)'],
};
