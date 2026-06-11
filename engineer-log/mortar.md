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
