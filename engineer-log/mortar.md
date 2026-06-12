# Engineer Log — Mortar (Backend)

Locked v2 backend engineer for Taco.

---

## 2026-06-11 — AC-5: v2 dashboard report read REAL imported invoices (BE)

Task: `2026-06-11-taco-dashboard-v2-kc-fixes` (AC-5 addendum). The Taro v2
dashboard at `/taro/v2/dashboard` rendered EMPTY despite 9 imported v2 invoices
(60 line items) in the DB.

**Root cause — timezone window bug (not a missing endpoint).** The aggregation
endpoints (`recap`/`trending`/`ai-insight`) existed and queried the right tables
(`taro_v2_invoice_line_items` → `taro_v2_invoices`). But `applyScope()` serialized
the period bounds with `Date.toISOString()` (UTC), while `invoices.created_at` is
`timestamp without time zone` storing **local** (Asia/Jakarta, UTC+7) wall-clock.
Postgres strips the `Z` and compares naive-to-naive, so the `< to` upper bound
landed 7h in the past — silently excluding every invoice created in the last 7h.
Since all 9 invoices were uploaded today, the window dropped 100% of them →
`invoice_count: 0`, empty `by_area`, empty `qty_over_time`.

DB proof: `count(*) WHERE created_at < now()` = 9, but
`< (now() at time zone 'utc')` = 0.

**Fix** (`backend/src/v2/dashboard/v2-dashboard.service.ts`):
- Added `toLocalNaive(Date)` → `"YYYY-MM-DD HH:mm:ss"` using local getters, and
  swapped both `applyScope()` bounds (`>= from`, `< to`) to use it. Bounds now
  live in the same local frame the column is stored in. Fixes recap, trending's
  scoping, and the ai-insight prior-window comparison (all route through
  `applyScope`).
- Repointed the area-name join from `inv.area` (was → `taro_v2_areas`, empty) to
  a raw `leftJoin('regions', 'area', 'area.id = inv.area_id')` in recap + trending.
  Areas were consolidated onto `regions` (Grout's `837b85bd`); raw join makes the
  dashboard independent of the entity relation and mirrors how Tile's
  `decorateListItems()` resolves names. Area now reads "ASM Bandung", not "Tanpa Area".

**Verified live :5013** (rebuilt dist + restarted) vs direct DB:
recap totals `{invoice_count:9, line_item_count:60, total_qty:461, taco_qty:454,
competitor_qty:7}` — exact match to `taro_v2_invoice_line_items`. trending top =
PVC BOARD 9 MM TACO (90), Espresso Oak (85), PVC BOARD 18 MM TACO (70).
ai-insight runs live Sonnet (`claude-sonnet-4-6`) over the real rollups. `?area=`
filter and `?period=all|30d` all return real, non-empty figures. tsc + eslint clean.

**Gotcha for future me:** `taro_v2_*` `created_at`/`updated_at` are
`timestamp without time zone` written as LOCAL wall-clock. NEVER feed
`toISOString()` (UTC) into a `created_at` comparison — it shifts the window by the
UTC offset and quietly hides recent rows. Use local-naive bounds (or cast both
sides to the same tz). Counts will look "mysteriously empty," not error.

**Dashboard-report contract (handed to Mosaic for FE wiring):**
- `GET /api/v2/dashboard/recap?period=&area=` → `{ period, range:{from,to},
  filter_area, totals:{area_count,invoice_count,line_item_count,total_qty,
  taco_qty,competitor_qty}, by_area:[{area_id,area_name,invoice_count,
  line_item_count,total_qty,taco_qty,competitor_qty}], qty_over_time:[{date,
  total_qty,line_item_count}] }`
- `GET /api/v2/dashboard/trending?period=&area=&limit=` → `{ period, range,
  limit_per_area, per_area:[{area_id,area_name,items:[{name,sku_id,is_competitor,
  total_qty,line_count}]}] }`
- `GET /api/v2/dashboard/ai-insight?period=&area=` → `{ period, range, model,
  insight (Bahasa string), rollups:{...recap + area_trends + trending} }`
- `period` ∈ `7d|30d|90d|this_month|last_month|this_quarter|ytd|all` (default `30d`).
  Admin + Manager only. All figures are LIVE from imported v2 invoices — no mock.

---

## 2026-06-11 — TACO v2: best-guess pre-select for review lines

**Task:** make the resolusi modal pre-select a SKU for low-confidence TACO review lines (taco_low_verify / taco_unreadable_guess) instead of opening blank.

**Root cause:** the v2 OCR processor ran exact-code → Claude suggestion → RAG(≥0.55) matching, but set `matched_sku_id = null` when all three failed. For OCR fragments like "056 AA" (truncated code missing the "TH" prefix), all standard strategies fail: no exact match, Claude returns null, RAG below threshold (OpenAI embeddings key was also placeholder, making RAG always fail). The FE keys the pre-select entirely off `matched_sku_id`, so null = blank modal.

**Fix — two new fallback strategies in `taro-v2-ocr.processor.ts`:**
1. **Suffix/partial code matching** (`findSuffixSkuCode` in `sku-code-matcher.ts`): if the normalized raw_text (e.g. "056AA") is a suffix of any catalog code ("TH056AA" → TH 056 AA), it's a match. Confidence 0.70, needs_review stays true. Works with no API calls.
2. **Low-threshold RAG fallback (≥0.10)**: fires after suffix matching if still null. For when embeddings ARE configured.

**Backfill endpoint:** `POST /api/v2/admin/backfill-pre-select` (admin-only) runs the same strategy on all existing TACO review lines with null matched_sku_id. Used to fix invoice ecfea6c6's "056 AA" line → TH 056 AA (Iron Rhino, id a6c481c0-7b27-4536-8e05-f93810067a82).

**Verified:** Playwright browser test confirmed modal opens with TH 056 AA pre-highlighted, save persisted to DB (needs_review=false, edited=true). Commit: 5f53e84f.

**Gotcha:** OpenAI API key in `.env` is a placeholder — RAG embeddings don't work. The suffix matcher is the primary live strategy; RAG is the future fallback when keys are configured.

---

## 2026-06-11 — v2 competitors seed gap: 5 → 9 HPL brands (re-gate)

Task: `2026-06-11-taco-v2-competitors-seed`. Round-2 QA flagged the v2
competitors page: AC wants 9 real HPL/laminate brands, seed only carried 5.

**Fix (`backend/src/database/seeds/seed-v2-competitors.ts`):** added 4 to
`REAL_COMPETITORS` — Formica (Amerika Serikat), Lamitak (Singapura), Skylam
(Indonesia), Artform (Indonesia) — and updated the header doc to list all 9.
Re-ran `npm run seed:v2-competitors`: **4 created, 0 reactivated**; second run
**0 created** (idempotent upsert by unique name); no duplicate brand names in DB.

**Verified live :5013** via `GET /api/competitor-brands` (the exact endpoint the
FE page consumes): all 9 — Grasmerino, Violam, Aica, Greenlam, Arborite, Formica,
Lamitak, Skylam, Artform — return `is_active:true` with a country. The page
renders the endpoint 1:1 on load (empty search ⇒ `filtered === brands`), so all 9
render. (FE dev server was down → no browser snapshot; verified at the data +
codepath the page reads.) No app restart needed — seed is data-only, app reads DB live.

**LANDMINE flagged to KC/Yumi (NOT silently "fixed"):** the QA premise "only 5
ever seeded" matches `seed-v2-competitors.ts`, but live `/competitor-brands`
returns **18 active**, not 9. The v2 page (and BE `findAll`) read the SHARED
`competitor_brands` table unfiltered, so 9 legacy/non-HPL v1 brands also show:
Armstrong, Egger, Greenply, Krono, Kronospan, Meranti, Pergo, Teka, Unilin (all
country=NULL, likely a v1 seed; some are flooring/panel/appliance brands, not HPL).
The AC's "9" is satisfied (all 9 HPL brands present+active), but the page will not
show *exactly* 9 until someone decides to either (a) scope the v2 page/endpoint to
the curated HPL set (e.g. country-tagged), or (b) deactivate the legacy brands.
Did NOT deactivate them — they may back v1 visit/competitor tracking; that's a
spec + data-ownership call, not an additive seed fix.

**Commit:** the seed edit landed as `6cbc8f14` (parallel/duplicate dispatch made
the identical `REAL_COMPETITORS` change ~same minute; my working copy matched it
byte-for-byte → no separate code commit). My contribution this turn = running the
seed against the live DB, the live verification (all 9 active, idempotent, no
dupes), and the 18-active landmine flag above.

---

## 2026-06-12 — Arborite → Javaco swap + AI-insight go-live (BE)

Task: `2026-06-12-taco-v2-arborite-to-javaco + ai-insight-key`. Two parts done
as one rebuild.

**Task 1 — rename competitor Arborite → Javaco (live code):**
- `seed-v2-competitors.ts`: `REAL_COMPETITORS` entry + header doc list.
- `invoices/invoice-ocr.processor.ts:176`: brand list in the OCR system prompt.
- Repo grep: zero other live-code hits (remaining "Arborite" strings are only the
  rename **source** + comment).
- Added an idempotent `RENAMES` step to the seed (`Arborite`→`Javaco`). A plain
  upsert of the edited list would CREATE Javaco but leave the old Arborite row
  active → "no Arborite" check fails. The rename updates the existing row in place
  (preserves id `7bf9f9e4…` + any FK tags; the row had 0 line-item refs), then the
  upsert no-ops. Fires only when `from` exists and `to` doesn't → idempotent.
- ⚠️ **Country left `Kanada`** per task ("leave if unsure") — but Javaco is almost
  certainly an Indonesian HPL brand; `Kanada` is carried over from Arborite.
  Flagged to KC; one-line fix when confirmed.
- Also fixed a pre-existing unused-`catch`-binding lint error in the OCR processor
  so the touched file commits clean.

**Task 2 — AI-insight key go-live:** `ANTHROPIC_API_KEY` in `backend/.env` was the
placeholder. Recovered the real key from TACO's OWN history
(`bc13bd36…:backend/.env`, valid `sk-ant-api03-…` 108 chars) and wrote ONLY that
line into `backend/.env` (gitignored-but-tracked → NEVER committed; left OPENAI +
all other lines untouched).

**Single rebuild sequence:** `nest build` → killed :5013 pid 46506 (KC's 17:09
keyless restart, the source of the insight 401s) → restarted `node dist/main` →
reseeded competitors.

**Verified live :5013** (admin JWT):
- `GET /api/competitor-brands` → **Javaco active, Arborite absent** (rename in
  place, same id).
- `GET /api/v2/dashboard/ai-insight?period=all` → HTTP 200, `model:
  claude-sonnet-4-6`, real Bahasa insight (NOT the model:null fallback). Recovered
  key is valid — not rotated.
- New :5013: **pid 49682, started 2026-06-12 17:22:10 WIB.** tsc + eslint clean.

**Gotcha:** `backend/.env` is in `.gitignore` BUT already tracked (committed before
it was ignored) — `.gitignore` does NOT protect it. Never `git add` it. Secrets
have lived in this repo's history (that's how the key was recoverable); worth a
history scrub + key rotation eventually (flagged, out of scope here).
