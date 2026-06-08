# 2026-06-08 — Taro FE: wire signed image URL endpoint

**Owner:** Quill
**Branch:** `feat/taro-fe-signed-image-url`
**BE dep:** Core commit `a1b3de77` — `GET /api/taro-invoices/:id/image-url`

## Problem

Before: FE rendered `<img src="/api/taro-invoices/:id/image">` directly.
Browsers don't attach Bearer headers on plain `<img>` GETs → 401 → black
tile on both the admin dashboard detail page and the PWA review page.

## Fix

Two-step load:

1. FE calls `GET /api/taro-invoices/:id/image-url` (with Bearer → 200).
2. BE returns `{ url: "/api/taro-invoices/:id/image?token=<15min-jwt>" }`.
3. FE resolves to absolute URL and drops into `<img src>`.
4. Browser fetches as plain GET. `JwtStrategy` reads `?token=` from query,
   validates the 15-min `taro_invoice_image`-scoped JWT, streams the image.

Skeleton/placeholder shown while signed URL is in flight.

## Files

- `frontend/lib/api.ts` — new `getInvoiceImageUrl(invoiceId)` helper. Resolves
  the relative URL against `API_BASE` origin (strip trailing `/api`) to avoid
  double-prefix.
- `frontend/app/taro/invoices/[id]/page.tsx` — admin dashboard detail page.
  New `imageUrl` state + `useEffect` keyed on `invoice?.id`. Two `<img>` swaps:
  left split-pane preview + zoom modal.
- `frontend/app/taro-app/upload/[id]/page.tsx` — PWA review page. New
  `imageUrl` state + `useEffect`. One `<img>` swap: 14×14 thumb in invoice
  meta row.

## Test

Verified live against `localhost:5013` (BE) + `localhost:4014` (FE) via
Playwright headless:

- Login as Admin (`admin@taco.id`) → `/taro/invoices/5566a357-...` →
  signed URL request 200 → image GET (no Bearer header) 200 → image rendered
  at 640×880. Screenshot: `/tmp/dashboard-image-loaded.png`.
- Login as Taro Agent (`taro1@taco.id`) → `/taro-app/upload/5566a357-...` →
  same flow → thumbnail rendered at 640×880. Screenshot:
  `/tmp/pwa-review-image-loaded.png`.

Both surfaces visibly show the OCR'd invoice photo. No more black tile.

## Verdict

Images visible on both surfaces.
