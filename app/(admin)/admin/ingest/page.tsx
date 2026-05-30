import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin-auth';
import IngestForm from '@/components/IngestForm';

export const dynamic = 'force-dynamic';

export default function IngestTestPage() {
  if (!isAdmin()) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Manual ingest / parser test</h1>
      <p className="mt-1 text-sm text-slate-500">
        Paste a real PropertyFinder listing's title + description below. The server runs the same parser chain
        the Apify webhook uses, and shows you what it extracted. Useful for tuning regexes against new broker phrasings.
      </p>
      <div className="mt-6">
        <IngestForm />
      </div>
    </div>
  );
}
