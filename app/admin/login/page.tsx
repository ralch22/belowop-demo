export default function AdminLoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams?.error;
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-card dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">Admin sign-in</h1>
        <p className="mt-1 text-xs text-slate-500">
          Enter the admin token. Magic-link sign-in lands once Resend is wired up.
        </p>
        <form method="POST" action="/api/admin/login" className="mt-5 space-y-3">
          <input
            name="token"
            type="password"
            placeholder="Admin token"
            autoComplete="off"
            required
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand dark:border-slate-700 dark:bg-slate-800"
          />
          {error === 'bad_token' && (
            <p className="text-xs text-red-700 dark:text-red-400">Bad token.</p>
          )}
          <button
            type="submit"
            className="w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
