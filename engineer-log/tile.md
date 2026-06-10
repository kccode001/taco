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
