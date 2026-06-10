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

---

## 2026-06-10 — Re-home four-way resolve onto the Taro system (BE)

Task: `tasks/2026-06-10-taco-resolve-rehome-be.md`. Decision 1 (decisions/2026-06-10).

**Root cause:** the four-way resolve from the earlier task landed on the
Visit/Invoice `PATCH /api/invoice-line-items/:id` → `invoice_line_items`, but the
PWA reads/writes `taro_invoice_line_items` (different table + UUIDs) → every PWA
resolve 404'd. Fix: move it onto the Taro endpoint by extending the existing
`patchLineItem` (taro-invoices.service.ts) — not a rebuild.

**Files**
- `database/entities/taro-invoice-line-item.entity.ts` — added `brand_id`
  (`@ManyToOne` CompetitorBrand, FK), `brand_name`, `is_unknown` (default false).
  `synchronize:true` created the columns + FK + default live; no migration. Reused
  `needs_review` for perlu-dicek — no new "unclear" column.
- `taro-invoices/dto/patch-line-item.dto.ts` — `PatchTaroLineItemDto` gained
  `brand_id?`, `is_unknown?`, `confirm_as_is?`; kept `matched_sku_id?` + `reason?`.
- `taro-invoices/taro-invoices.module.ts` — registered `CompetitorBrand` in forFeature.
- `taro-invoices/taro-invoices.service.ts` — rewrote `patchLineItem` (four actions,
  precedence, mutual-exclusion, brand lookup → brand_name, kept TARO_AGENT guard +
  SKU-correction record on TACO-match change). Return type now
  `TaroInvoiceLineItem & { invoice_status }`. **Also fixed `recomputeInvoiceStatus`
  + the boot backfill** to key on `needs_review` alone, dropping the
  `matched_sku_id IS NULL` / `confidence < 0.85` terms — otherwise a competitor or
  unknown line (legitimately no SKU) would keep the invoice stuck at needs_review
  and the backfill would re-flag fully-resolved invoices on every reboot.

**Contract (FROZEN — Tile repoints FE):** `PATCH /api/taro-invoices/line-items/:id`,
body = one action, precedence `confirm_as_is → matched_sku_id → is_unknown → brand_id`:
- `{ matched_sku_id }` confirmed TACO match (taro-native name; `null` unmatches; `reason` required on change)
- `{ brand_id }` competitor brand (resolves competitor_brands → brand_name)
- `{ is_unknown: true }` competitor-but-unknown
- `{ confirm_as_is: true }` "Sudah benar" (keep match, clear needs_review)
Each clears the others. Competitor + confirm_as_is clear needs_review. Response:
saved line item + top-level `invoice_status` ("done" | "needs_review").

**Verification:** booted real DI graph vs live Postgres — 24/24 assertions green
(four actions, precedence, mutual-exclusion clearing, Selesai/Perlu-Review flip,
validation: no-action 400, unknown brand_id 400, reason-required). `tsc --noEmit`
clean; 0 net new lint errors on touched files (repo carries pre-existing
prettier debt; `lint` is `--fix`). Pushed to main `81ca3a00`. Left the
Visit/Invoice `/invoice-line-items/:id` as-is (out of PWA scope).

Scout gated `81ca3a00` end-to-end — resolve contract passed clean (four actions,
mutual exclusion, confirm-precedence, 400/401 validation, SKU-correction audit).

---

## 2026-06-10 — Fix seed:taro-invoices-demo entity list (BUG-2, Sev-2)

Task: `tasks/2026-06-10-scout-taco-line-item-resolution-hardgate.md`.

The new `brand` `@ManyToOne` on `TaroInvoiceLineItem` (from the rehome above)
pulled `CompetitorBrand` into the demo seed's metadata graph, crashing
`npm run seed:taro-invoices-demo` with *"Entity metadata for
TaroInvoiceLineItem#brand not found"*. Demo data couldn't be reset; live app
unaffected.

Scout flagged it as a one-liner (add CompetitorBrand), but the seed's
hand-maintained entity list was **already stale**: `TaroInvoice#uploaded_by_user`
(→ User → Territory + TaroAgentRegion) predates my work and had never been added
— it just surfaced as the next metadata error once CompetitorBrand was fixed.
Added the full relation closure: **CompetitorBrand, User, Territory,
TaroAgentRegion**. Seed-only (`database/seeds/seed-taro-invoices-demo.ts`).

**Verified:** seed runs clean — 42 invoices / 234 line items. `tsc --noEmit`
clean; 0 net-new lint. Pushed to main `e414f84d`.

---

## 2026-06-10 — RE-GATE 4 seed blockers: BUG-3 + BUG-2 sibling

Task: `tasks/2026-06-10-scout-taco-line-item-resolution-hardgate.md`. Two
seed-only BE bugs blocking the PWA re-gate.

**BUG-3 (AC-5 blocker) — `seed-taro-invoices-demo.ts`.** Region invoices
hardcoded `status = DONE`, but per-line `needs_review` (conf < 0.85) is computed
afterward → 25/42 "done" invoices held needs_review lines → PWA showed a green
"Sudah Selesai" banner over orange "Perlu Dicek" lines. Fix: derive status from
the lines — accumulate `anyNeedsReview` across the line loop, then
`update(invoice, NEEDS_REVIEW)` after the lines exist (lines FK the invoice id,
so status is corrected post-insert). Mirrors runtime `recomputeInvoiceStatus`.
Tanpa-Region block already forces needs_review=false, so its DONE stays correct.
→ `cf0cc54c`.

**BUG-2 sibling — `seed-taro-sales-agents.ts`.** Same CompetitorBrand metadata
crash as the demo seed (the new `brand` relation), exit 1 → 0/42 invoices owned
→ no taro_agent saw any invoice. Added CompetitorBrand import + entities entry
(this seed already had User/Territory/TaroAgentRegion). → `2cfa5a9b`.

**Verified (live Postgres after re-seeding both, in order):** 0 `done` invoices
hold a needs_review line (25 needs_review / 17 done); `seed:taro-sales-agents`
exits 0 with 42/42 invoices owned (0 unowned). `tsc --noEmit` clean; 0 net-new
lint on both files. Both pushed to main.

---

## 2026-06-10 — Home-screen list thumbnails: `image_url` on list payloads (BE)

Task: include the invoice photo as the home-screen list thumbnail (unblocks a
Tile FE change). FE `TaroInvoiceSummary` already expects `image_url?` but the BE
list endpoints never populated it → arrived `undefined` → FE showed the generic
store icon. Also kills N-call waste (FE was about to fetch a signed URL per row).

**Files (BE only — list-serialization path; resolve/patch untouched)**
- `taro-invoices/taro-invoices.service.ts` — refactored `signImageUrl` to extract
  `signImageToken` (mint the `/:id/image?token=` URL without the per-call
  `imagePath` existence check). Added `storedImageIds()` (one `readdirSync`, maps
  files `${id}${ext}` → Set of ids) and `withImageUrls(rows, user)` (attaches a
  signed `image_url` per row, or `null` when no file on disk). Wired into `list()`
  (added `user` to params + `image_url` to the return type) and
  `inProgressForUser()` (signature now takes the `{id,email,role}` user, returns
  `image_url`). Both methods only called from the taro-invoices controller.
- `taro-invoices/taro-invoices.controller.ts` — `GET /` (`list`) and
  `GET uploads/in-progress` now pass the `@CurrentUser` `{id,email,role}` through.

**Contract:** list rows (`GET /api/taro-invoices`) and in-progress rows
(`GET /api/taro-invoices/uploads/in-progress`) each carry `image_url: string | null`
— a 15-min signed `/api/taro-invoices/:id/image?token=...` (same scheme/TTL as the
detail `/:id/image-url`, no new auth), or `null` when the image file isn't on disk
so the FE falls back to the icon (never a 404 URL). One `readdirSync` per page;
one HMAC sign per row. JwtStrategy validates sig + active user (scope/invoice_id
informational), so the detail token works as-is for list rows.

**Verified:** booted real DI graph vs live Postgres — 14/14 assertions: list
returns `image_url` on every row (3 signed / 42 null on current data), signed URL
decodes with correct shape + `scope=taro_invoice_image` + `invoice_id`/`sub`,
file-on-disk ↔ signed and no-file ↔ null both confirmed, `inProgressForUser(null) → []`.
`tsc --noEmit` clean; 0 net-new lint (304 = baseline; the one prettier nit my new
code added, I hand-fixed). Pushed to main.
