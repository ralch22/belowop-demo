// One-shot migration runner.
// Usage: POSTGRES_URL=... npx tsx db/migrate.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '@vercel/postgres';

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('POSTGRES_URL not set. Provision Vercel Postgres first.');
    process.exit(1);
  }
  const dir = join(process.cwd(), 'db', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    console.log(`Running ${f} (${text.length} bytes)…`);
    // @vercel/postgres requires a single statement per call when using sql.query;
    // for multi-statement migrations use unsafe execution via the pool client.
    await sql.query(text);
    console.log(`  ✓ ${f}`);
  }
  console.log('All migrations applied.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
