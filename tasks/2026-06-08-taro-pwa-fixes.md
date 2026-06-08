# Taro PWA Fixes — Real Flow

**Date:** 2026-06-08
**Owner:** Flux
**Branch:** feat/taro-pwa-fixes-real-flow
**Scope:** Remove ALL mock/fake behavior from the Taro Sales Agent PWA upload flow + 5 UX fixes KC flagged after walkthrough.

## Changes

### 1. Removed mock/fake behavior (CRITICAL)
- `app/taro-app/home/page.tsx` — removed `MOCK_AGENT_UPLOADS` fallback; on BE error surfaces a real "Gagal memuat: …" with retry button.
- `app/taro-app/history/page.tsx` — same: no mock fallback, real error state with retry.
- `app/taro-app/profile/page.tsx` — removed mock fallback in stats calculation.
- `app/taro-app/upload/page.tsx` — gutted the simulated progress timer (`simulateProgress`); polling now only reflects real BE state from `GET /api/taro-invoices/uploads/in-progress`. When IDs disappear from the in-progress feed the row is treated as `done` (BE removes finished rows from that endpoint). On BE error the polling continues + a real error toast is shown. No more localStorage-timestamp-based fake percent.
- `app/taro-app/upload/[id]/page.tsx` — removed the `MOCK_INVOICE_DETAIL` import + `fallback()` wrapper. On BE failure shows real error UI ("Gagal memuat invoice") with retry. Inlined `confidenceTone()` + `formatIdr()` so the page no longer depends on admin mock module.

### 2. Fixed upload bulk-upload contract
- `lib/api.ts` — `bulkUploadTaroInvoices` now accepts `storeName` (third arg) and forwards it as `store_name` multipart field per the BE controller. Response type updated to support both the new array shape (`[{id, file_name, status, region_id, store_name}]`) and the legacy `{uploaded, invoice_ids}` shape. Both `/admin/taro-invoices/upload` and `/taro/invoices/upload` admin pages updated to normalize the new shape.

### 3. Fix 1 — Removed max-file cap (5 → unlimited)
- `app/taro-app/upload/page.tsx` Step 2 — removed `slice(0, 5)` in `addFiles`, dropped `queue.length >= 5` disabled state on picker tiles, replaced "Foto Invoice (X/5)" label with "Foto Invoice (X foto)".

### 4. Fix 2 — Circular FAB bottom nav
- `app/taro-app/_components/BottomNav.tsx` rewritten. 5 elements: **Beranda · Riwayat | (+) | Notifikasi · Profil**. Center is a 60px orange circle raised 24px above the bar baseline with shadow. Inline PlusIcon, navigates to `/taro-app/upload`.
- New stub page `app/taro-app/notifications/page.tsx` for the Notifikasi tab (empty state).

### 5. Fix 3 — Removed greeting on homescreen
- `app/taro-app/home/page.tsx` — deleted the "Selamat pagi, [name]" header card. Region badge and first-name pill remain in `TopBar` (already there). The page now opens straight into "Upload Hari Ini" summary.

### 6. Fix 4 — Weekly upload chart on homescreen
- `app/taro-app/home/page.tsx` added a "Upload 7 Hari Terakhir" card with big total + inline SVG line chart (no chart lib needed; hand-rolled SVG with area gradient + data point labels + Sen/Sel/Rab/Kam/Jum/Sab/Min weekday axis). Aggregates client-side from `GET /api/taro-invoices?limit=200` filtered to current user via `uploaded_by_user_id` / `uploaded_by` (BE may add either; we accept both, falling back to all rows when neither is present).

### 7. Fix 5 — Status-aware bottom CTA on review page
- `app/taro-app/upload/[id]/page.tsx`:
  - `status=done` → button reads "✓ Sudah Selesai" disabled + green banner at top "Invoice ini sudah diproses pada [date]. Edit baris masih bisa dilakukan."
  - `status=processing|queued|ocr|mapping` → button reads "Memproses…" disabled + blue banner; page auto-polls every 3s until the row finishes.
  - `status=failed` → button reads "Upload Ulang" routing to `/taro-app/upload` + red banner.
  - `status=needs_review` or `review` → normal "Selesai" CTA.

## Files Changed

- `frontend/app/taro-app/_components/BottomNav.tsx` (rewrite)
- `frontend/app/taro-app/home/page.tsx` (rewrite)
- `frontend/app/taro-app/upload/page.tsx` (rewrite)
- `frontend/app/taro-app/upload/[id]/page.tsx` (rewrite)
- `frontend/app/taro-app/history/page.tsx` (mock fallback removed + error state)
- `frontend/app/taro-app/profile/page.tsx` (mock fallback removed)
- `frontend/app/taro-app/notifications/page.tsx` (new stub)
- `frontend/lib/api.ts` (bulkUploadTaroInvoices signature + response type)
- `frontend/app/admin/taro-invoices/upload/page.tsx` (response shape normalization)
- `frontend/app/taro/invoices/upload/page.tsx` (response shape normalization)

## Screenshots

- /tmp/taro-app-home-no-greeting-chart.png
- /tmp/taro-app-bottom-nav-fab.png
- /tmp/taro-app-upload-unlimited.png
- /tmp/taro-app-upload-detail-done.png

## End-to-end test result

Logged in as `taro1@taco.id` / `password123`, filled "Toko Real OCR Test", attached a real 112KB JPEG invoice from `backend/uploads/taro-invoices/`, clicked "Mulai Proses" — `POST /api/taro-invoices/bulk-upload` returned `201` with real invoice ID `3aa22301-f110-44d4-8dd0-d2a265a4af8a`. PWA navigated to `/taro-app/upload/3aa22301-…` after ~6s.

**OCR did not produce line items.** Two blockers:

### BE blocker 1 — Anthropic API key invalid
```
[Nest] [TaroInvoiceOcrProcessor] Taro OCR failed for 1989e2c3-…: 401
{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
[Nest] [TaroInvoiceOcrProcessor] RAG candidate probe failed: 401 Incorrect API
key provided: your-ope*******-key.
```
Both `ANTHROPIC_API_KEY` (Claude Vision OCR) and `OPENAI_API_KEY` (embeddings/RAG probe) are placeholder/invalid values. The OCR worker fails at the first Claude call and the invoice never advances past `queued`. Core/Scout to set real keys in the BE env.

### BE blocker 2 — taro_agent role lacks permission for list/detail endpoints
```
GET /api/taro-invoices              → 403 (admin/manager only)
GET /api/taro-invoices/:id          → 403 (admin/manager only)
GET /api/taro-invoices/analytics    → 403 (admin/manager only)
```
The class-level `@Roles(UserRole.ADMIN, UserRole.MANAGER)` in `taro-invoices.controller.ts` only allows TARO_AGENT on `bulk-upload` and `uploads/in-progress`. As a result the homescreen chart, history, and review-detail pages all 403 for the agent (and now properly surface the error per "no mocks" rule). The detail screenshot was captured via admin login to show the intended done-state design.

**Core needs to:** add `UserRole.TARO_AGENT` to the `@Roles` decorator on `findOne` (`GET /:id`) and `list` (`GET /`) — scoped to the agent's own uploads (`uploaded_by = currentUser.id`). For analytics, either skip exposing it to agents or add a `?scope=mine` filter.

### Optional: weekly stats endpoint
Per task spec, FE currently fetches `?limit=200` and aggregates client-side. Once Core ships `GET /api/taro-invoices/my-weekly-stats` returning `{ days: [{date, weekday_short, count}] }` the home page swap is a 10-min FE change.

## Commit
TBD after staging.
