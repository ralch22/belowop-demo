import { Cairo } from 'next/font/google';

// Arabic UI webfont, self-hosted by next/font (downloaded at build time, served
// from /_next/static — no runtime Google request, so it honours both the
// `font-src 'self'` CSP and the privacy policy's "no third-party" promise).
//
// Scoped to RTL only (see globals.css): English keeps its existing
// 'Inter', system-ui stack unchanged, so the EN site stays pixel-identical.
// The 'latin' subset is included so Latin tokens inside Arabic pages (project
// names, AED prices in Western digits) render in the same family.
export const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
});
