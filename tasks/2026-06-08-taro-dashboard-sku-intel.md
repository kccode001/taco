# Taro Dashboard — SKU Intel + Split Invoice + Observation-Only Failed OCR + Multi-Region Agents + Enriched Recommendations

Date: 2026-06-08
Engineer: Quill (FE — Desktop Admin)
Branch: feat/taro-dashboard-sku-intel (pushed direct to main per No-PRs-in-Early-Dev)

## Scope — 5 Fixes

### Fix 1 — Invoice detail split-view layout
`/taro/invoices/[id]` rebuilt as a 12-col grid (image 5 / right 7) at lg+, stacked < 1024px.

- Left column: dark invoice image preview (full viewport height on lg+), centered ZoomIn icon when image_url missing, click → fullscreen modal with close button.
- Right column top: Meta card — invoice id + status badge in same row, store_name (when BE ships), 2-col label/value grid (Wilayah ASM pill, Sales Agent when present, Tanggal, Total, Jumlah baris), confidence summary chips (X yakin / Y perlu cek / Z perlu review) with avg badge.
- Right column bottom: Line items card with sticky header, internal scroll, 6-col table (Raw OCR with line# inline, Matched SKU, Conf%, Qty, Total stacked over unit_price, Edit).

### Fix 2 — Failed OCR observation-only
`/taro/failed-ocr` stripped of PATCH/mapping capability per KC: "this shouldn't map from dashboard… in dashboard just want to preview".

- Removed: Map ke SKU modal + per-row button + updateTaroLineItem call.
- Added: header re-titled "OCR Gagal — Apa yang Terjadi di Lapangan", subhead pointing mapping flow to PWA.
- Added: 4 KPI tiles (Total kemunculan, Mirip TACO, Kemungkinan Kompetitor, Rata-rata Frekuensi) derived from full row set.
- Table rebuilt around BE's grouped-by-raw_text shape: Frekuensi (occurrence_count), Alasan (failure_reason), Closest TACO Match (read-only chip with similarity %), Wilayah (union), Agent (union), Tindak Lanjut hint chip (informational only — "Tambahkan sinonim ke SKU X" / "Kemungkinan kompetitor" / "Pertimbangkan SKU baru").
- Row click → expand inline showing up to 5 sample line items with invoice_id link + confidence + agent + date.
- "Salin ke Rekomendasi" CTA top-right → calls POST /recommendations/regenerate.

### Fix 3 — Sales Agent multi-region
`/taro/agents` form rebuilt around multi-region picker with primary radio.

- Form: search box + checkbox list (18 ASM areas) + "Utama" radio per checked region.
- Chips: selected regions rendered above the picker with star prefix for primary + × to remove.
- Table Wilayah column: stacks chips with ★ marker on primary.
- Region filter: filters agents by ANY region (primary OR secondary), not just primary.
- BE normalization: `normalizeAgent()` reads either shape A (legacy `region: {…}` or `taro_region_id`) or shape B (`regions: [{id, code, display_path, is_primary}]`). Auto-resolves when Core ships shape B — confirmed live: BE returned Budi Santoso with 2 regions (Jakarta JKT1 primary + JKT2 secondary).
- Payload: POST/PATCH sends `{ region_ids: string[], primary_region_id: string }`.

### Fix 4 — Dashboard SKU intelligence
`/taro/dashboard` rebuilt around SKU intelligence per KC: "the goals of this taro project is to know what are the product that Popular, trends on taco product, maybe can detect other popular product that is not TACO".

5 new panels in order:
1. Top 10 TACO SKU Terpopuler — horizontal bars with volume + total_value.
2. TACO SKU Trending Bulan Ini — top growers (green ▲) + top decliners (red ▼) with growth_pct, sentinel handling for "from-zero" (BE emits 9999 → "1000%+").
3. TACO SKU Kurang Diminati — bottom 10 by volume, slate-toned bars.
4. Produk Non-TACO Terdeteksi — table of raw_text + frequency + avg_price + closest TACO match chip (with "Pertimbangkan sinonim" badge when sim 0.65-0.85, "Kemungkinan kompetitor" badge when no match), region sebaran chips.
5. Tren Volume TACO SKU (6 bulan) — inline SVG stacked-line chart for top SKUs, brand-adjacent palette (no rainbow).

KPI row trimmed to: Total Invoice (orange-accented), Perlu Review, Rata-rata Kepercayaan, SKU TACO Aktif.

Shape normalization: helpers `skuCode/skuName/vol/trendingVol/nonTacoFreq/closestSku/nonTacoRegions` read both BE nested shape (`sku: {code, name}`, `total_volume`, `occurrence_count`, `likely_taco_sku_match`, `regions_seen_in`) and legacy mock flat shape (`sku_code`, `volume`, `frequency`, `closest_taco_sku`, `regions`). Auto-resolved live.

### Fix 5 — Recommendations enriched with OCR failure data
`/taro/recommendations` upgraded to surface BE's two new card types and source provenance.

- New filter dimension: Sumber pill row (Semua / Koreksi Admin / OCR Gagal) with per-status counts.
- Status pill row kept (Pending / Diterapkan / Ditolak).
- Per-card Source badge: gray "Koreksi Admin" or warning-tinted "OCR Gagal" chip.
- New type chips: `update_sku_knowledge` (green) + `investigate_competitor` (red). BE-emitted `add_synonym` aliased to "Tambah Sinonim".
- Payload detail strip — surfaces structured fields (existing_sku, suggested_synonym, raw_text + occurrence_count, regions) when BE attaches them.
- Subtitle updated: "berdasarkan koreksi admin + OCR gagal terbaru".
- Reads BE's `suggested_payload` (vs legacy `payload`) and normalizes `failed_ocr` → `ocr_failure` source.

## Files Changed

- frontend/app/taro/invoices/[id]/page.tsx — split layout rebuild
- frontend/app/taro/failed-ocr/page.tsx — observation-only rebuild + axios fetch
- frontend/app/taro/agents/page.tsx — multi-region picker + chip table + axios fetch
- frontend/app/taro/dashboard/page.tsx — full SKU intelligence rebuild
- frontend/app/taro/recommendations/page.tsx — source filter + payload strip + type aliases
- frontend/app/admin/taro-invoices/_components/mockData.ts — 5 new mock arrays for SKU intel + new rec types with source field
- frontend/app/admin/taro-invoices/recommendations/page.tsx — type label/tone exhaustiveness fix
- frontend/lib/api.ts — added TaroSkuRankedRow/TaroSkuTrendingRow/TaroSkuMonthlyRow/TaroNonTacoProductRow types + extended TaroAnalytics with 5 new optional arrays + extended TaroRecommendation with `source` and `payload`

## BE Coordination

Core had landed all required endpoints in parallel — auto-resolved cleanly:

| Endpoint | Shape Drift | Resolution |
|----------|-------------|-----------|
| GET /taro-invoices/analytics — `top_taco_skus[]` | BE nests `sku: { code, name, category }` + `total_volume` (not flat `sku_code/volume`) | Added shape helpers reading either nested or flat |
| `trending_taco_skus[]` | BE emits integer percent (9999 = from-zero sentinel) | UI clamps to "1000%+" when ≥ 1000; treats values > 5 as percent, otherwise fraction |
| `detected_non_taco_products[]` | BE uses `occurrence_count`, `likely_taco_sku_match` (nested `sku`), `regions_seen_in: [{region, count}]` | Helpers fall back to legacy `frequency / closest_taco_sku / regions` |
| GET /taro-sales-agents | BE returns single `region: {…}` for legacy seed users, `regions: []` array for new seed (Budi Santoso confirmed live with multi-region) | normalizeAgent() reads either shape |
| GET /taro-invoices/failed-ocr | BE shape matches FE expectation exactly (raw_text grouped, failure_reason enum, sample_line_items with nested region+agent) | No drift |
| GET /taro-invoices/recommendations | BE emits `type: "add_synonym"` (vs FE `synonym`), `source: "failed_ocr"` (vs FE `ocr_failure`), `suggested_payload` (vs FE `payload`) | Aliases + normalizers added |

Fields landed live: regions_summary, region_monthly, top_skus_by_region, region_price_extremes, agents_summary, agent_monthly, top_taco_skus, least_popular_taco_skus, trending_taco_skus, taco_sku_monthly, detected_non_taco_products, failed-ocr aggregations, taro-sales-agents CRUD, recommendations generator emitting OCR-failure-sourced cards.

Fields fell back to mock: none for the 5 fixes (all auto-resolved).

## Layout Verification

Invoice detail at 1440x900 viewport confirmed side-by-side: 5-col image (dark canvas with centered ZoomIn icon) + 7-col right pane (meta card top, line items table bottom with all 6 columns including Edit buttons visible). Collapses to stacked < 1024px via `lg:grid-cols-12` breakpoint.

## Screenshots

- /tmp/taro-invoice-detail-split.png
- /tmp/taro-failed-ocr-observation.png
- /tmp/taro-agents-multi-region.png (table chips with ★ primary marker)
- /tmp/taro-agents-multi-region-modal.png (modal with multi-select + primary radio)
- /tmp/taro-dashboard-sku-intel.png
- /tmp/taro-recommendations-sources.png

## Hard Rules

- ONE orange per page: Upload CTA on dashboard, Salin ke Rekomendasi on failed-ocr, + Tambah Agent on agents, Regenerate on recommendations, no orange on invoice detail.
- Inline SVG icons only.
- Inter ≥16px body.
- Responsive grid breaks at 1024px.
- tsc --noEmit clean for all 8 touched files (pre-existing DashboardLayout lucide errors only).
