# Taro Backend Bugfix Batch — 2026-06-08

Owner: core
Branch: `feat/taro-bugfix-batch`
Scope: backend (port 5013) — fixes for 3 Scout-flagged bugs.

## BUG-1 (P1) — Invoice image preview returns 401

Option A implemented: signed URL with short-lived JWT.

- New endpoint `GET /api/taro-invoices/:id/image-url` → returns `{ url: "/api/taro-invoices/:id/image?token=<jwt>" }`.
- Token TTL: **15 minutes**, signed with the existing `JWT_SECRET` and includes `scope: "taro_invoice_image"` + `invoice_id` claims.
- JWT strategy now accepts `?token=` query param as a fallback to the `Authorization: Bearer` header (`ExtractJwt.fromExtractors`).
- The `/image-url` endpoint runs the same scope check as `findOne()` so a taro_agent can only sign URLs for invoices they uploaded (returns 404 otherwise — probing resistant).
- `/image` is now also `@Roles(ADMIN, MANAGER, TARO_AGENT)` so role check passes once token is verified.

## BUG-2 (P1) — TARO_AGENT can't save edited line

- Added `TARO_AGENT` to `@Roles(...)` on the `PATCH /api/taro-invoices/line-items/:id` handler.
- Service `patchLineItem(...)` now takes an optional `actor: { id, role }`. For `TARO_AGENT`, it loads the parent invoice and throws `ForbiddenException` when `invoice.uploaded_by !== actor.id`.
- Actor is derived from the JWT (`@CurrentUser('id')` / `@CurrentUser('role')`), never from query/body.

## BUG-3 (P2) — Search filter ignored

- `ListTaroInvoicesDto` gained `search?: string`.
- `TaroInvoicesService.list()` accepts `search` and applies an `ILIKE '%q%'` OR across:
  - `inv.store_name`
  - `inv.id::text` (full UUID)
  - `inv.file_name`
  - `region.name`
  - `region.display_path`
  - `uploaded_by_user.name`
- Region + uploader joins are added only when search is active so the default list query stays cheap.
- Both the main query and the count query apply the same filter so pagination math stays correct.

## Files changed

- `backend/src/auth/strategies/jwt.strategy.ts`
- `backend/src/taro-invoices/taro-invoices.module.ts`
- `backend/src/taro-invoices/taro-invoices.controller.ts`
- `backend/src/taro-invoices/taro-invoices.service.ts`
- `backend/src/taro-invoices/dto/list-taro-invoices.dto.ts`

## Verification (curl)

All run against `http://localhost:5013` with the fresh build deployed.

1. `GET /image-url` as taro_agent → `200 { url: "...?token=..." }`; visiting that URL with no Bearer header → `200 image/jpeg, 54603 bytes`.
2. `PATCH /line-items/<own_id>` as taro_agent → `200` with updated row.
3. `PATCH /line-items/<foreign_id>` as taro_agent → `403 "Taro agents can only edit line items on invoices they uploaded"`.
4. `GET /taro-invoices?search=Sumber` as admin → `total=5` (vs. baseline 81).
5. `GET /taro-invoices?search=demo-invoice-15` as admin → `total=1`.
6. `GET /taro-invoices?search=Sumber%20Jaya` as admin → `total=1` (phrase match).

## Build

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npm run build` → clean.
