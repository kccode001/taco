# Engineer Log — Tile (Frontend)

Locked frontend engineer for **taco**.

---

## 2026-06-10 — PWA line-item resolution (task: 2026-06-10-pwa-line-item-resolution)

**Scope (mine):** AC-1, AC-2, AC-3, AC-6 + AC-5 (shared w/ Grout).
**File:** `frontend/app/taro-app/upload/[id]/page.tsx` (+ `frontend/lib/api.ts`).

### What I built
- **"Belum cocok" lines** → added a **"Bukan produk TACO"** button that opens a
  competitor-brand picker sheet (`CompetitorPickerSheet`). Brands from
  `GET /api/competitor-brands`, **active only** (`is_active !== false`),
  name-sorted. Pure tap-list — **no text input, no on-screen keyboard** (per
  "NO keyboard icon" rule). Includes a **"Tidak diketahui"** (Unknown) option.
- **"Perlu dicek" lines** → kept **Edit SKU** (existing flow, AC-4 untouched),
  added a **"Sudah benar"** button (`handleConfirmAsIs`).
- All new actions hit the FIXED contract `PATCH /api/invoice-line-items/:id`
  via new `resolveInvoiceLineItem()` in `lib/api.ts`:
  `{brand_id}` / `{is_unknown:true}` / `{confirm_as_is:true}` (and `{taco_sku_id}`
  is wired in the helper for completeness; the existing Edit SKU sheet still uses
  the legacy taro edit path so AC-4 keeps working).
- **Live status badge (AC-5):** response carries `invoice_status`; `applyResolution`
  reflects it, with a local `recomputeStatus()` fallback that mirrors Grout's
  server rule (all resolved → `done`/Selesai, else `needs_review`/Perlu Review).
  No full reload — optimistic local line updates.
- New per-line classifier `resolveLine()` drives badge/border/title/actions and
  the OCR summary pills, preferring explicit BE fields
  (`brand_id` / `is_unknown` / `is_unclear`) and falling back to confidence bands
  so legacy rows don't regress.
- Extended `TaroInvoiceLine` + the detail normalizer to pass through
  `brand_id`, `brand_name`, `is_unknown`, `is_unclear` (defensive/optional).

### Quality
- `tsc --noEmit`: clean for my files (pre-existing DashboardLayout/lucide errors
  are unrelated and predate this task).
- `eslint` on both files: clean.
- Design: matched the existing in-house bottom-sheet pattern (`EditLineSheet`)
  for visual consistency — the taro-app PWA uses its own `taco-*` tokens + icon
  set, not raw shadcn primitives (no `sheet.tsx` exists). Mobile-first, ≥44px
  touch targets, Indonesian labels throughout, busy/disabled/error states.

### ⚠️ Integration risk flagged to Yumi + Grout (BLOCKER for end-to-end)
The PWA review page reads line items from **`taro_invoice_line_items`**
(`getTaroInvoice` → `/taro-invoices/:id`), but Grout's
`PATCH /api/invoice-line-items/:id` mutates **`invoice_line_items`** (the
Visit/Invoice system, `lineItemsRepo`). **Different tables → different UUIDs**,
so a taro line id sent to the resolve endpoint will 404. The task spec conflated
the two systems. My FE is correct to the fixed contract; resolving this is a
Grout/Yumi data-source decision (point the resolve endpoint at taro line items
+ add the brand/unknown/unclear columns to `taro_invoice_line_items`, OR serve
the PWA detail from the invoice system). Until then it won't function live.

**Status:** FE complete + contract-aligned + pushed. NOT verified end-to-end
(blocked on the id-space reconciliation above).

### 2026-06-10 (later) — BLOCKER RESOLVED: repointed to Taro system (Decision 1)
Yumi locked the direction: re-home resolve onto the **Taro** system (not
Visit/Invoice). My flagged id-space mismatch was the right call; fix is on the
data-source side. Repointed per the frozen contract — no waiting on Grout's BE
merge (the contract is the contract):
- **Endpoint:** `resolveInvoiceLineItem` now hits
  `PATCH /api/taro-invoices/line-items/:id` (was `/invoice-line-items/:id`) —
  same base as the existing `updateTaroLineItem`. `lib/api.ts`.
- **Field rename:** TACO-match field is `matched_sku_id`, not `taco_sku_id` —
  renamed in `ResolveLineItemBody` + dropped the stale `taco_sku_id` from
  `ResolveLineItemResponse` (kept `matched_sku_id`). `brand_id` / `is_unknown` /
  `confirm_as_is` unchanged.
- **Dropped the `is_unclear` flag assumption:** BE doesn't carry it. Perlu-dicek
  is now driven purely by the OCR confidence warn-band in `resolveLine()`, and a
  resolved/confirmed line clears via the recomputed `invoice_status` from the
  response (the "Sudah benar" path bumps local confidence out of the warn band).
  Removed `is_unclear` from `TaroInvoiceLine`, the raw-line type, the detail
  normalizer, the classifier condition, and the 3 optimistic post-resolve writes.
- **Status badge:** unchanged — still reads `invoice_status` top-level with the
  defensive `status`/`invoice.status` fallback. Decision confirms Grout returns
  it top-level.

**Quality:** `tsc --noEmit` + `eslint` clean on both files. Remaining
`taco_sku_id`/`is_unclear` refs in the tree are the separate Visit/Invoice system
(`app/app/visit/*`, `app/app/invoice/*`) — not mine, legit there.

**Status:** Repointed + pushed. Now contract-aligned to the live Taro endpoint;
end-to-end verifiable once Grout's matching BE lands.
