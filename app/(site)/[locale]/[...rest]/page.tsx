import { setRequestLocale } from 'next-intl/server';
import NotFound from '../not-found';

// Catch-all for unmatched paths under a locale (e.g. /ar/does-not-exist).
//
// We render the localized not-found UI directly rather than calling
// notFound(). With multiple root layouts (the (site) and (admin) route
// groups, no app/layout.tsx), Next.js can't compose the not-found *boundary*
// with a root layout for SSR — notFound() streams the boundary into the RSC
// payload but server-renders the framework's bare __next_error__ shell, so
// no-JS clients and crawlers see an unbranded, LTR English page. Rendering the
// component here keeps it inside [locale]/layout.tsx, so the 404 stays
// branded, localized, and direction-aware in the initial HTML.
export const dynamic = 'force-dynamic';

export function generateMetadata() {
  // Unmatched URLs should never be indexed.
  return { robots: { index: false, follow: false } };
}

export default function CatchAllNotFound({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return <NotFound />;
}
