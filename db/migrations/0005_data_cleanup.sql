-- Data-layer cleanup for FIX-01 and FIX-02 (BUILD_BRIEF.md 2026-05-22).
--
-- This migration:
--   1. Makes listings.original_price NULLABLE so the OP parser can write
--      NULL when no OP was found (FIX-01). The existing schema forced a
--      NOT NULL value, which is why the webhook handler had to fabricate
--      a 5% fallback that then leaked into the UI as "-4.8%".
--   2. Backfills already-fabricated original_price rows to NULL. The
--      fabrication pattern from app/api/webhooks/apify/route.ts:409 was:
--          originalPrice = Math.round(currentPrice * 1.05)
--      so any row where original_price ≈ current_price * 1.05 was
--      synthesised, not real. We invert the heuristic to clear them.
--   3. Coerces any literal 'NaN' bedroom values (FIX-02) to NULL so the
--      renderer can format them as "Studio" / "—" instead of "NaN BR".
--
-- CALLER ACTION REQUIRED after this migration lands:
--   · app/api/webhooks/apify/route.ts line ~409 must change from
--       const originalPrice = opParse.op ?? Math.round(currentPrice * 1.05);
--     to
--       const originalPrice = opParse.op; // null when not parsed
--   · lib/db.ts upsertScrapedListing() must accept originalPrice: number | null
--   · The price_drop calculation in lib/db.ts line ~294 must guard on
--     originalPrice !== null before computing drop_pct.

-- 1. Allow NULL for original_price going forward.
ALTER TABLE listings ALTER COLUMN original_price DROP NOT NULL;

-- 2. Clear fabricated-fallback values. Two equivalent shapes of the 5%
--    fallback (integer rounding vs ratio) — null both.
--    Tolerance of ±1 AED to absorb Math.round() drift.
UPDATE listings
SET original_price = NULL
WHERE original_price IS NOT NULL
  AND (
    ABS(original_price - ROUND(current_price * 1.05)) <= 1
    OR ABS(original_price - (current_price + current_price / 20)) <= 1
  );

-- 3. NaN bedroom cleanup. The historical bug wrote the literal string
--    'NaN' into beds (the column is TEXT NOT NULL — see 0001_init.sql).
--    Per BUILD_BRIEF FIX-02 we coerce to 'studio' as the safest fallback
--    (renderer can still choose to render as 'Studio' or '—' downstream
--    based on sqft / property type). This avoids a schema-altering
--    NOT NULL drop on a column with thousands of historical rows.
UPDATE listings
SET beds = 'studio'
WHERE beds = 'NaN' OR beds = 'nan';
