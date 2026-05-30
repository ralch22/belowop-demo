/**
 * Natural-language listing search — POST /api/search.
 *
 * Translates a broker's free-text client brief ("2-bed in Dubai Marina under
 * 3M, at least 10% below OP, off-plan") into the structured `Filters` object
 * that drives the existing client-side filtering pipeline.
 *
 * Model routing: a plain model id (default "openai/gpt-4o-mini", override via
 * AI_SEARCH_MODEL) is auto-routed through the Vercel AI Gateway by the AI SDK.
 * Auth is AI_GATEWAY_API_KEY locally and the auto-injected VERCEL_OIDC_TOKEN on
 * Vercel. When neither is present (local dev / pre-provisioning) — or if the
 * gateway call fails — we fall back to a deterministic keyword parser so the
 * feature degrades gracefully, mirroring how leads/KV/DB degrade elsewhere.
 *
 * Safety:
 *   - Rate-limited per client IP via KV (paid LLM calls; abuse guard).
 *   - The query is length-capped; the model NEVER touches SQL — its output is
 *     constrained to a JSON schema and then clamped/canonicalised by
 *     `sanitizeFilters` before it can reach a filter or a URL.
 */
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { generateObject, jsonSchema } from 'ai';
import { isKvConfigured, rateLimit } from '@/lib/kv';
import { allCommunities, allDevelopers } from '@/lib/listings';
import {
  buildSearchPrompt,
  heuristicParse,
  sanitizeFilters,
  SEARCH_OUTPUT_JSON_SCHEMA,
  MAX_QUERY_LEN,
  type RawSearchObject,
  type SearchVocab,
} from '@/lib/nl-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// AI search is cheap but billable — cap per-IP usage. A broker iterating on a
// brief comfortably fits; scripted abuse does not.
const SEARCH_RL_LIMIT = 30;
const SEARCH_RL_WINDOW_SECONDS = 60 * 60; // 1h

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const q = typeof body?.q === 'string' ? body.q.trim() : '';

  if (!q) {
    return NextResponse.json({ ok: false, error: 'empty_query' }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LEN) {
    return NextResponse.json({ ok: false, error: 'query_too_long' }, { status: 400 });
  }

  // Rate-limit per IP. Best-effort: if KV isn't configured we log and continue
  // (dev/staging), matching the leads route's posture.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 16) : 'noip';
  if (isKvConfigured()) {
    const rl = await rateLimit(`search:rl:${ipHash}`, SEARCH_RL_LIMIT, SEARCH_RL_WINDOW_SECONDS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited' },
        { status: 429 },
      );
    }
  }

  const vocab: SearchVocab = { communities: allCommunities, developers: allDevelopers };
  const model = process.env.AI_SEARCH_MODEL || DEFAULT_MODEL;

  if (gatewayConfigured()) {
    try {
      const { object } = await generateObject({
        model,
        schema: jsonSchema<RawSearchObject>(SEARCH_OUTPUT_JSON_SCHEMA as Record<string, unknown>),
        prompt: buildSearchPrompt(q, vocab),
        temperature: 0,
        maxRetries: 1,
      });
      const filters = sanitizeFilters(object, vocab);
      return NextResponse.json({ ok: true, filters, source: 'ai', model });
    } catch (e) {
      console.error('[search] AI Gateway call failed — falling back to heuristic:', e);
      const filters = heuristicParse(q, vocab);
      return NextResponse.json({ ok: true, filters, source: 'heuristic' });
    }
  }

  // No gateway configured — deterministic fallback keeps the bar usable.
  const filters = heuristicParse(q, vocab);
  return NextResponse.json({ ok: true, filters, source: 'heuristic' });
}
