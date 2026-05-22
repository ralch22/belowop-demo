/** @type {import('next').NextConfig} */
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

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'wzn4byw4tfl22gbj.public.blob.vercel-storage.com' },
      { protocol: 'https', hostname: 'static.shared.propertyfinder.ae' },
    ],
  },
};

module.exports = withPWA(nextConfig);
