/**
 * Image sync worker — runs on Vercel Cron every 5 min.
 *
 * Walks listings without Blob images, fetches each source URL server-side,
 * transcodes to 800w WebP via `sharp`, uploads to Vercel Blob, and writes
 * the resulting public URLs back to the listing row.
 *
 * Auth: requires `Authorization: Bearer <CRON_SECRET>` header. Vercel Cron
 * sends this automatically when the env var is set on the project.
 */
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import sharp from 'sharp';
import { listingsNeedingBlobSync, setBlobImages, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — comfortably under Vercel Hobby's 60s ceiling.

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // permissive when not configured (dev / first deploy)
  const header = req.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return NextResponse.json({ ok: true, skipped: 'db not configured' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: false, error: 'BLOB_READ_WRITE_TOKEN missing' }, { status: 500 });
  }

  // Smaller batch (was 10) to stay well under maxDuration with 4 images each
  // and the 500ms inter-fetch jitter.
  const batch = await listingsNeedingBlobSync(6);
  const stats = { listings: batch.length, uploaded: 0, persisted: 0, errors: 0 };
  console.log('[image-sync] batch ids', batch.map((b) => b.id));

  for (const row of batch) {
    const urls: string[] = [];
    for (let i = 0; i < Math.min(row.source_image_urls.length, 4); i++) {
      const src = row.source_image_urls[i];
      try {
        const resp = await fetch(src, {
          headers: { 'User-Agent': 'BelowOPImageWorker/1.0 (+https://belowop.vercel.app)' },
        });
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const webp = await sharp(buf).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
        const result = await put(`listings/${row.external_ref}/${i}.webp`, webp, {
          access: 'public',
          contentType: 'image/webp',
          addRandomSuffix: false,
        });
        urls.push(result.url);
        stats.uploaded++;
        // Polite crawl: 500ms between fetches (matches scraper UA budget).
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.error('[image-sync] failed', row.external_ref, i, e);
        stats.errors++;
      }
    }
    if (urls.length > 0) {
      try {
        await setBlobImages(row.id, urls);
        stats.persisted++;
      } catch (e) {
        console.error('[image-sync] setBlobImages failed for', row.id, e);
        stats.errors++;
      }
    }
  }

  return NextResponse.json({ ok: true, stats });
}
