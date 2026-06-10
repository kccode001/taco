# Engineer Log — Grout (Backend)

Locked backend engineer for Taco.

---

## 2026-06-10 — PWA line-item resolution (BE)

Task: `tasks/2026-06-10-pwa-line-item-resolution.md` (with Tile on FE).

Extended `PATCH /api/invoice-line-items/:id` so a rep can fully resolve a line
item four ways and get the recomputed invoice status back in one call.

**Files**
- `backend/src/database/entities/invoice.entity.ts` — added `NEEDS_REVIEW = 'needs_review'`
  to `InvoiceStatus`. (Postgres `invoices_status_enum` already carried the value;
  `synchronize:true`, no migration needed — all other fields already existed on
  `InvoiceLineItem`.)
- `backend/src/invoices/dto/patch-line-item.dto.ts` — new `PatchInvoiceLineItemDto`
  (class-validator): `brand_id?`, `is_unknown?`, `taco_sku_id?`, `confirm_as_is?`, `note?`.
- `backend/src/invoices/invoices.service.ts` — rewrote `updateLineItem`; added
  `recomputeInvoiceStatus` + `isLineResolved` + `INVOICE_STATUS_LABELS`; injected
  `CompetitorBrand` repo (already in the module's `forFeature`).
- `backend/src/invoices/invoices.controller.ts` — typed the body with the DTO.

**Contract (FIXED — Tile builds against this)**
`PATCH /api/invoice-line-items/:id`, body = one action per call:
- `{ brand_id }` → competitor brand match (derives `brand_name`, clears `taco_sku_id`, `is_unknown=false`)
- `{ is_unknown: true }` → competitor-but-unknown (clears `brand_id` + `taco_sku_id`)
- `{ taco_sku_id }` → confirmed TACO match (clears competitor/unknown + perlu-dicek)
- `{ confirm_as_is: true }` → "Sudah benar" (clears `is_unclear`, locks confidence, keeps match)
- `{ note }` orthogonal, may accompany any action.

Response:
```json
{ "line_item": { ...InvoiceLineItem },
  "invoice_status": "done" | "needs_review",
  "invoice_status_label": "Selesai" | "Perlu Review" }
```

Resolved predicate: `!is_unclear && (taco_sku_id || brand_id || competitor_sku_id || is_unknown)`.
All resolved → `done` (Selesai); else `needs_review` (Perlu Review). Recompute only
touches invoices already at done/needs_review (leaves processing/failed alone).

**Verification:** booted real DI graph against live Postgres, exercised AC-1..AC-5
(+ unresolve regression) — all green. `nest build` + eslint clean on touched files.

Note for Yumi/Tile: `GET /api/competitor-brands` returns ALL brands (not just
`is_active`). Left as-is per "reuse it" — FE should filter `is_active` for the picker,
or say the word and I'll add an active-only filter server-side.
