# Seed 5 adhesive SKUs into TACO catalog + embeddings

**Agent:** Core
**Date:** 2026-06-08
**Branch:** `feat/seed-adhesive-skus`
**Status:** ✅ done

## Goal

Add 5 adhesive SKUs (Lem Taco Active + StarMax product lines) to the TACO
catalog with rich Indonesian aliases, generate OpenAI embeddings, and verify
RAG retrieval against typical OCR phrasings ("Lem Taco Activ", "Lem Kuning
600 gram", etc.).

## Decisions

- **Catalog category** — Added new free-text value `TACO ADHESIVE` to
  `taco_skus.catalog_category`. No DB migration required: the column is
  `text`, not a Postgres enum. Existing values stay (`FIDECO`, `Flooring`,
  `Hardware`, `Laminates`).
- **Survey enum** — Adhesive doesn't fit any of the 9 `TacoSkuCategory`
  buckets (LAMINATE, HPL, ECO_HPL, SHEET, EDGING, HARDWARE, VINYL, PLYWOOD,
  LAINNYA), so parked under `LAINNYA`. Stock-level survey cards (D3) stay
  unaffected.
- **xlsx parser** — Skipped: only 5 rows + `xlsx` package not in deps. Rows
  hardcoded in `ADHESIVE_ROWS` in the seed script with the source xlsx path
  documented in the header comment.
- **API filter** — Added `?catalog_category=` query param to
  `GET /api/taco-skus` so the new analytics segment is queryable.

## Files

- `backend/src/database/seeds/seed-taco-adhesive-skus.ts` — new seed (idempotent
  upsert by code + inline embedding via OpenAI)
- `backend/src/taco-skus/dto/sku-query.dto.ts` — added `catalog_category` field
- `backend/src/taco-skus/taco-skus.service.ts` — wired `catalog_category` filter
- `backend/package.json` — added `seed:taco-adhesive-skus` script

## Run

```
OPENAI_API_KEY=... npm run seed:taco-adhesive-skus
# optional: --skip-embed
```

## Verification

```
inserted=5 updated=0 total_seeded=5
Embedded 5/5 SKUs (dims=3072).
taco_skus total rows now: 970 (was 965)

GET /api/taco-skus?search=LTA-600           → 1 result (LTA-600)
GET /api/taco-skus?search=Lem%20Taco        → 5 results (all adhesive)
GET /api/taco-skus?catalog_category=TACO%20ADHESIVE → 5 results
```

### RAG probes (cosine similarity, text-embedding-3-large)

| Probe text              | Top-1 SKU  | Score  |
|-------------------------|------------|--------|
| Lem Taco Activ          | LTA-600    | 0.6665 |
| Lem Kuning 600 gram     | LTA-600    | 0.5250 |
| Lem Taco StarMax 2.5kg  | LTSM-2500  | 0.7767 |
| Lem Taco 10kg           | LTA-10K    | 0.6976 |

Top-5 of every probe is swept by the 5 adhesive SKUs — zero non-adhesive
contamination, so the OCR matcher will lock onto the right product even
when the absolute similarity floats below the 0.7 threshold.
