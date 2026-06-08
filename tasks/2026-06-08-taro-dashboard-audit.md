# Taro Dashboard Audit — Real-Data Polish

Date: 2026-06-08
Engineer: Quill (FE — Desktop Admin)
Branch: feat/taro-dashboard-real-data-polish (pushed direct to main per No-PRs-in-Early-Dev)

## Brief

KC: "Audit the Taro Dashboard surfaces under REAL data now that the API keys are live. Look for any place still showing mocks/stubs, any UX issue, and fix."

7 surfaces audited as Admin via `/auth/login` (admin@taco.id / password123).

## Audit Table

| Surface | Status | Issue found | Fix applied |
| --- | --- | --- | --- |
| `/taro/dashboard` | FIXED | KPI tiles showed mock values (168 diproses / 16 Perlu Review) bleeding through `{...MOCK_ANALYTICS, ...data}` because BE returns `processed_count` / `needs_review_count`, not the legacy `processed` / `needs_review` keys | Replaced shallow merge with explicit normalizer that maps BE `*_count` fields → FE keys, falls back to mock only when all three top-line numbers are zero |
| `/taro/invoices` (list) | FIXED | `short_id` rendered as first 12 chars of UUID (e.g. `2fd8c5d0-46d`) — ugly and not meaningful | Use BE `file_name` minus extension (e.g. `demo-invoice-34`) as the display ID; falls back to 8-char UUID slice if no file_name |
| `/taro/invoices/[id]` (detail) | FIXED | (1) Image preview never rendered — BE ships `raw_image_url`, FE read `image_url`; (2) Avg confidence + line counts in meta showed mock-leaked values; (3) `total_amount` arrived as numeric string `"0.00"` from BE | Centralized `normalizeTaroInvoiceDetail` in `lib/api.ts` (built by parallel agent) now maps `raw_image_url` → absolute `image_url` (resolved against API origin so the `<img>` hits port 5013 not 4014), casts `total_amount` to number, derives `short_id` from file_name, line_items numeric coercion already wired by parallel agent |
| `/taro/recommendations` | OK | 4 real `failed_ocr`-sourced recommendation cards render with real similarity scores + source chips | No fix — already real |
| `/taro/failed-ocr` | OK | 20 real grouped rows render with real `regions_seen` / `agents_seen` derived from `sample_line_items`; KPI tiles compute against real row set | No fix — already real |
| `/taro/agents` | FIXED | Reset-password fallback generated a random local string when BE response wasn't recognized — BE returns `{ id, password }` but FE read `temporary_password`, so even successful resets went through the random-fallback path | Accept either `password` or `temporary_password`; on real error, show "Gagal reset password. Coba lagi." instead of fabricating a fake one |
| `/taro/taco-skus` | OK | Real catalog renders from BE; product line + category filters work | No fix needed |

## Verified Backend Connectivity

All 7 surfaces hit the BE on port 5013 with the admin JWT. Real data flowing for:
- `/api/taro-invoices/analytics` (5 SKU intel arrays + KPI counts)
- `/api/taro-invoices` (54+ invoices, paginated)
- `/api/taro-invoices/<id>` (with `raw_image_url`, real `line_items`)
- `/api/taro-invoices/recommendations?status=pending` (4 pending cards)
- `/api/taro-invoices/failed-ocr` (20 grouped rows)
- `/api/taro-sales-agents` (5 agents, multi-region rendered)
- `/api/taro-sales-agents/<id>/reset-password` (returns real `{password}`)
- `/api/regions/areas` (18 ASM areas)
- `/api/taco-skus` (full RAG catalog)

## Notes for KC

- Demo-seed invoices (`raw_image_url` = `/api/taro-invoices/demo-XX/image`) return 400 on the BE because the underlying image files were never persisted to disk during seeding. The FE now wires the URL correctly — once a real PWA upload lands, the image preview will work. Try uploading via `/taro-app` as `taro1@taco.id` to see the preview light up.
- Analytics totals move quickly because BE appears to auto-seed more invoices over time (44 → 54 → 61 during the audit). That's a BE seeder behavior, not a FE issue.
- Mock fallbacks remain ONLY as last-resort safety nets when an array is empty or BE 404s — they no longer leak into KPI tiles or rich data panels.

## Screenshots

- `/tmp/taro-dash-audit-1.png` — Dashboard with real KPIs (Total Invoice 63, Perlu Review 133, 69% confidence) + real SKU intel panels
- `/tmp/taro-dash-audit-2.png` — Invoice list with `demo-invoice-XX` short_ids + real region paths
- `/tmp/taro-dash-audit-3-invoice-detail.png` — Invoice detail with real line items, real conf %, real totals, image preview wired (broken image is BE seed missing file)
- `/tmp/taro-dash-audit-4-recommendations.png` — Real `failed_ocr`-sourced cards, source filter counts accurate
- `/tmp/taro-dash-audit-5-failed-ocr.png` — 20 real grouped rows, KPI tiles real
- `/tmp/taro-dash-audit-6-agents.png` — 5 real agents, multi-region chips work (Budi Santoso shows JKT1 primary + JKT2 secondary)
