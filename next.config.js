/** @type {import('next').NextConfig} */
const createNextIntlPlugin = require('next-intl/plugin');
// Point the plugin at the request-scoped i18n config (messages + locale).
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const withPWA = require('next-pwa')({
  dest: 'public',
  // Disable in development; enable for production builds.
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // Precache the home and offline fallback (other routes are picked up by
  // runtime caching strategies below).
  fallbacks: {
    document: '/offline',
  },
  // Per UI.md §7.2.
  runtimeCaching: [
    // Listing API: stale-while-revalidate, 30 min freshness window.
    {
      urlPattern: ({ url, sameOrigin }) =>
        sameOrigin && (url.pathname.startsWith('/api/listings') || url.pathname === '/'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'belowop-listings',
        expiration: { maxEntries: 60, maxAgeSeconds: 30 * 60 },
      },
    },
    // Blob-hosted images: cache-first, 50 entries, 7 days.
    {
      urlPattern: /^https:\/\/wzn4byw4tfl22gbj\.public\.blob\.vercel-storage\.com\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'belowop-blob-images',
        expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // PropertyFinder CDN images: cache-first, same policy.
    {
      urlPattern: /^https:\/\/static\.shared\.propertyfinder\.ae\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'belowop-pf-images',
        expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // /api/og hero image: stale-while-revalidate, 24h.
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/og'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'belowop-og',
        expiration: { maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    // Next image optimizer
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/image'),
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'belowop-next-images',
        expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    },
    // Static assets (JS/CSS) — let workbox handle them.
    {
      urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/_next/static'),
      handler: 'CacheFirst',
      options: {
        cacheName: 'belowop-next-static',
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Security headers (CLAUDE.md §7 — security hardening, HIGH-priority block).
//
// Content-Security-Policy is delivered as a static header. We allow
// `'unsafe-inline'` for script/style because Next.js injects inline bootstrap
// scripts and inline styles during hydration and next-pwa registers the
// service worker inline; a strict nonce-based CSP would require per-request
// middleware and is tracked as a future hardening. Even so, this policy blocks
// all third-party script/connect/frame origins, clickjacking, MIME sniffing,
// base-tag hijacking, and forces HTTPS.
//
// Image/connect origins mirror next.config `images.remotePatterns` plus the
// Vercel Blob bucket and PropertyFinder CDN that the PWA service worker caches.
// ---------------------------------------------------------------------------
const IMG_ORIGINS = [
  'https://wzn4byw4tfl22gbj.public.blob.vercel-storage.com',
  'https://static.shared.propertyfinder.ae',
  'https://images.unsplash.com',
];

// Next.js dev-mode React Fast Refresh ships `@next/react-refresh-utils`, whose
// runtime calls `eval()`. With a strict `script-src` (no `'unsafe-eval'`) the
// browser throws an EvalError at that runtime, the client bundle never finishes
// evaluating, and React never hydrates — so EVERY interactive control (filters,
// sort, pagination, the inquire modal) is dead in local dev. Production builds
// don't use eval, so we only relax the policy in development and keep prod strict.
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${IMG_ORIGINS.join(' ')}`,
  `connect-src 'self' https://vitals.vercel-insights.com ${IMG_ORIGINS.join(' ')}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'wzn4byw4tfl22gbj.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'static.shared.propertyfinder.ae' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = withNextIntl(withPWA(nextConfig));
