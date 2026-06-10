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

### 2026-06-10 (later) — BUG-1 FIX: classifier reads `needs_review` (Scout hard gate)
Scout's end-to-end gate (`tasks/2026-06-10-scout-taco-line-item-resolution-hardgate.md`)
failed AC-3: a "Perlu dicek" line confirmed via "Sudah benar" reverted to orange
on reload, and a BE-`done` invoice contradicted itself (green "Sudah Selesai"
banner while lines still read "Perlu Dicek"). Root cause: my `resolveLine()`
inferred the review state purely from the OCR **confidence band**, but the BE
marks a line resolved by clearing **`needs_review`** (and `confirm_as_is` does
*not* bump confidence). My optimistic confidence bump was in-session only → lost
on reload. Applied Scout's recommended FE fix (aligns with Decision 1):
- **`resolveLine()` now reads `needs_review` as the resolved signal.** For a
  matched line: `needs_review===false` → "Yakin" regardless of score;
  `===true` → "Perlu Dicek". When the BE **omits** the flag, fall back to the
  confidence warn-band so legacy rows don't regress. `brand_id`/`is_unknown`
  still win outright. This single change fixes the per-line badge, `isLineResolved`,
  `recomputeStatus`, and the summary pills (all route through `resolveLine`).
- **Plumbed `needs_review` through the data layer:** added to `TaroInvoiceLine`,
  `BERawLine`, and the detail normalizer (`lib/api.ts`) — coerces a 0/1 numeric
  to boolean, preserves `undefined` when absent so the fallback engages.
- **Optimistic writes now mirror BE truth:** "Sudah benar" and Edit SKU set
  `needs_review:false` (dropped the stale `confidence` hacks at the old :316/:832);
  brand/unknown patches also set it for consistency. Persists across reload.

**Quality:** `tsc --noEmit` + `eslint` clean on both FE files. Scope: FE only.
**Fixes:** AC-3 (durable "Sudah benar"), AC-4 reload rendering, AC-5 banner
contradiction — one classifier change, per Scout.

**Status:** Pushed. Pinged Scout to re-gate + Yumi.

### 2026-06-10 (later) — BELT-FIX: recompute invoice status on initial load (RE-GATE 4)
RE-GATE 4 confirmed BUG-1 (`f1c88b33`) holds — AC-1/2/3/4/6 pass. Scout routed
one remaining FE defensive ask: `resolveLine()` reads `needs_review` correctly on
mutation, but on initial page load the banner/badge/summary rendered straight from
the GET payload's `status`. A stray "done" invoice still carrying `needs_review`
lines would render a contradictory screen (green "all done" banner + orange "Perlu
Dicek" lines).
- **Fix:** `refetch()` now normalizes the loaded invoice's status through the same
  `recomputeStatus(line_items, status)` rule used post-mutation, so banner +
  per-line badges + summary count agree on first render. `recomputeStatus` already
  no-ops for in-flight states (processing/queued/pending/failed), so OCR-in-progress
  invoices are untouched. One-line change in the `refetch` success branch
  (`page.tsx` ~:213).
- Belt-and-suspenders alongside Grout's seed-data fix (parallel, data-source side).

**Quality:** `tsc --noEmit` clean for my file (only the pre-existing
DashboardLayout/lucide errors remain, unrelated); `eslint` clean. Scope: 1 FE file
+ ledger.

**Status:** Pushed. Pinged Yumi with the commit SHA to verify HEAD moved before
re-gate.

---

## 2026-06-10 — Tap-to-preview invoice image (lightbox) — additive FE task

**Scope (mine):** AC-1..AC-6, FE-only. Files: `app/taro-app/upload/[id]/page.tsx`
+ `app/taro-app/_components/icons.tsx` (new `ExpandIcon`). Additive — not a
re-gate of the resolution feature.

### What I built
- **Thumbnail is now tappable** (AC-1, AC-4): the meta-block 56×56 thumb (`w-14
  h-14`, ≥44px) becomes a `<button>` **only when `imageUrl` is present**; tapping
  opens a full-screen lightbox. The `StoreIcon` no-image fallback stays a plain
  non-interactive `<div>` — no dead tap target. Added a subtle corner affordance
  (`ExpandIcon` in a translucent badge) + `cursor-pointer` so it reads as tappable.
- **`ImageLightbox` overlay** (AC-1, AC-3): `fixed inset-0 z-[60] bg-black/90`,
  image `object-contain max-w-*/max-h-* ` → full invoice legible, never cropped,
  no horizontal page shift. Scroll container sets `touch-action: pinch-zoom` for
  native pinch where the browser supports it.
- **Dismiss four ways + scroll lock** (AC-2): backdrop tap, X button, Esc key,
  and the device back gesture. Single close funnel — Esc/X/backdrop all call
  `history.back()`; a `pushState` on open + a `popstate` handler is the one place
  that flips parent state off, so the back gesture and explicit closes behave
  identically and leave no phantom history entry. `document.body.style.overflow`
  locked while open, restored on cleanup.
- **Mobile-first / ID labels** (AC-5): aria/alt in Indonesian ("Lihat foto
  invoice", "Tutup", "Foto invoice penuh"), no text input, no keyboard, no
  keyboard icon. Uses existing `taco-*` tokens + the in-house icon set (added
  `ExpandIcon` matching the shared 24px/1.8-stroke `base()` convention).

### Impeccable critique catch
The X button sits inside the backdrop's `onClick=requestClose`, so its click
bubbled up → **two** `history.back()` calls → would pop the lightbox **and**
navigate the review screen away. Fixed with `stopPropagation()` on the close
button; the image already stops propagation so a tap/pinch on it never dismisses.

### Quality / verification
- `tsc --noEmit`: only the 2 pre-existing DashboardLayout/lucide errors remain
  (unrelated, predate this task); 0 from my files. `eslint`: clean on both files.
- **Verified the preview path against KC's reference invoice
  `be2d2d0d-1313-4afa-99c7-d70a59c618ed`:** its image exists on disk
  (`backend/uploads/taro-invoices/be2d2d0d-….jpeg`, 115KB) → `signImageUrl`
  hands out a valid signed URL → `imageUrl` non-null → interactive thumb +
  lightbox render that exact jpeg. Verified at the data/signing level; live
  browser click-through is Scout's separate smoke check (per the task).

**Status:** FE complete, pushed. Status.json flipped working→idle. Pinged Yumi.

---

## 2026-06-10 — Re-editable competitor/unknown line + path back to TACO SKU

**Scope (mine):** AC-1..AC-6, FE-only (KC verified no BE work needed). Files:
`app/taro-app/upload/[id]/page.tsx` + `lib/api.ts` (one type field).

### The gap
A line resolved as **competitor** (`resolved_competitor`) or **unknown**
(`resolved_unknown`) had NO action block, and the top-right pencil opened the
SKU-only `EditLineSheet` — so a rep who mis-marked a line as competitor couldn't
see which brand it was set to, nor flip it back to "this IS a TACO product + SKU".

### What I built — state-aware `ResolveEditSheet`
New sheet (decision-latitude: chose the unified state-aware editor KC flagged as
cleaner) that reflects the line's current classification and offers every valid
transition. Two affordances open it: the **pencil** (routed to this sheet for
competitor/unknown lines instead of the SKU-only one) and a new **action block**
on the card (`Ganti/Pilih merek` + `Ini produk TACO`, mirroring the perlu_dicek
2-col grid). Two modes:
- **Classify mode** — pure tap-list. Shows a "Saat ini: …" chip with the current
  state. The current competitor brand is highlighted + checkmarked in the brand
  list (or the "Tidak diketahui" option is highlighted for unknown lines) → **AC-1**.
  Rep can switch competitor A→B (`pickBrand`), competitor↔unknown (`pickUnknown`),
  with no-op guards when re-tapping the current state → **AC-4**. A prominent
  "Ini produk TACO" button enters taco mode.
- **TACO mode** — reuses the EditLineSheet SKU search list (search input + tap to
  select) + an editable **reason** textarea pre-filled with a sensible default
  (`reason` is required by the BE on `matched_sku_id` change — kept it editable so
  reps can refine the learning signal, tap-save works out of the box). Save sends
  `resolveInvoiceLineItem(id, { matched_sku_id, reason })` → **AC-2/AC-3**.

### Contract / BE alignment (read the service to confirm, not assume)
`patchLineItem` `matched_sku_id` branch (taro-invoices.service.ts:~852) sets
`brand_id=null, brand_name=null, is_unknown=false, needs_review=!matched_sku_id`
(→ false) and requires `reason` when the SKU changes. My optimistic write mirrors
it field-for-field: `{matched_sku_id, matched_sku_code, matched_sku_name,
brand_id:null, brand_name:null, is_unknown:false, needs_review:false}`. Brand/
unknown switches mirror their branches too. Everything drives `needs_review` —
the authoritative resolved signal `resolveLine()` reads — so resolutions survive
reload via the canonical GET → **AC-6**. Added `reason?` to `ResolveLineItemBody`
so the TACO-match save goes through the typed resolve helper (one-line api.ts add).

### AC-5 / design
Mobile-first PWA sheet, ≥44px targets (brand/SKU rows min-h 52px), pure tap-list
for classification (no on-screen keyboard for the resolution itself; SKU search +
reason reuse the existing EditLineSheet inputs), **no keyboard icon**, Indonesian
labels ("Ubah klasifikasi", "Ini produk TACO", "Ganti merek kompetitor", "Pilih
SKU TACO", "Saat ini:", "Tidak diketahui"). Matches the in-house `taco-*` system
and existing bottom-sheet pattern. Inline error state (sheet stays open to retry,
better than the picker's close-on-error). Lazy-loads SKUs only on entering taco
mode.

### Quality / verification
- `tsc --noEmit`: 0 errors from my files (only the pre-existing
  DashboardLayout/lucide errors remain). `eslint`: clean on both files.
- Ran an impeccable critique pass on the diff — **no blockers**; the two
  SHOULD-FIX notes (optimistic state not reconciled against the server echo) are
  the *existing* accepted pattern in this file (CompetitorPickerSheet /
  handleConfirmAsIs work the same way, Scout-gated), patches verified to mirror BE
  truth, and reload pulls canonical data. Left as-is for consistency.
- **Data-level verify against KC's reference invoice
  `be2d2d0d-1313-4afa-99c7-d70a59c618ed`:** confirmed it holds a competitor line
  (#2, brand "Unilin") and an unknown line (#1) — both now get the re-edit
  affordance. Left that data intact so Scout has live competitor/unknown lines to
  smoke-check. Live click-through is Scout's pass.

**Status:** FE complete + pushed. status.json working→idle. Pinged Yumi.

---

## 2026-06-10 — Home-card polish: drop stray region dash (Part A) + invoice thumb (Part B)

**Scope (mine):** AC-1..AC-3, FE-only. File: `app/taro-app/home/page.tsx`.
Two parts; Part B depends on Grout adding `image_url` to the recent/in-progress
list payload (in flight) — Yumi gating my go on Part B. Shipped Part A now.

### Part A — region dash fix (AC-1) ✅ DONE
`{u.region_display ?? "—"}` (line ~334) rendered a lonely em-dash under the store
name when an invoice had no region (KC saw a meaningless "--"). Fix: **omit the
row entirely** when `region_display` is absent rather than show a placeholder —
`region_display ? <div>…</div> : null`. Audited the rest of the card: `store_name`
already falls back to `short_id`/`id` (never blank), and the line-count/time rows
are already conditionally rendered, so 334 was the only stray placeholder.

**Quality:** `tsc --noEmit` clean for my file (only pre-existing
DashboardLayout/lucide errors remain, unrelated); `eslint` clean.

### Part B — invoice photo thumbnail (AC-2) — HOLDING for Grout
Awaiting Yumi's go: render `u.image_url` as `<img object-cover>` in the 40×40
thumb box (lines ~325–327), `StoreIcon` fallback when null, lazy-load. Won't
render against the unpopulated field until Grout confirms `image_url` is live in
the list payload (this morning's lesson). `TaroInvoiceSummary.image_url?` already
declared at `lib/api.ts:758`.

**Status (Part A):** Pushed. status.json working→idle. Pinged Yumi w/ commit.

---

## 2026-06-10 — RE-GATE 6 / BUG-6: image lightbox un-dismissable (trap fix)

**Scope (mine):** FE-only. File: `app/taro-app/upload/[id]/page.tsx` (`ImageLightbox`,
+ `useRef` import). Features 2 (competitor re-edit) + 3 (home thumbs) PASSED clean
in RE-GATE 6; this was the sole blocker.

### The bug (Scout's instrumentation, confirmed)
The lightbox couldn't be dismissed by ANY of its four paths (X / Esc / backdrop /
back-gesture) — rep tapping an invoice photo was trapped full-screen. Root cause:
the close funnel routed everything through `window.history.back()`, and the mount
`useEffect` had deps `[onClose, requestClose]` where `onClose={() =>
setPreviewOpen(false)}` is a **fresh identity every render** → the effect re-ran and
re-`pushState`'d on each render; under React StrictMode (dev) it double-pushed, so
the `popstate`→unmount handshake desynced and `onClose` never fired.

### The fix (Scout's recommended path)
- **X / Esc / backdrop now unmount DIRECTLY via parent state** (`onClose()` →
  `setPreviewOpen(false)`), with **no `history.back()` round-trip** — a close always
  sticks. Removed the `requestClose` funnel entirely.
- **History entry pushed exactly ONCE**, guarded by `window.history.state?.tacoLightbox`
  so it's idempotent under StrictMode's dev double-invoke and reuses a leftover entry
  across re-opens (never stacks phantom entries). Merge existing state into the push so
  Next's router routing keys aren't clobbered.
- **Dropped the unstable effect deps → `[]`** (runs once on mount). The long-lived
  `popstate`/`keydown` listeners call the latest `onClose` via an `onCloseRef` (ref,
  not a dep) so the effect never re-runs.
- **Back-gesture kept as additive convenience:** `popstate` → `onCloseRef.current()`.
  No `history.back()` in cleanup (that would self-close on StrictMode's throwaway
  unmount). Leftover dummy entry on explicit close is harmless — absorbs one silent
  back press, self-corrects on next open via the guard; never traps.
- Did NOT regress F1-1/2/3/5: open, object-contain, pinch-zoom (`touchAction`
  unchanged), tap-image-doesn't-close (`stopPropagation` on img kept), no-image
  non-interactive thumb (untouched).

### Quality / verification
- `tsc --noEmit`: 0 errors from my file (only the 2 pre-existing
  `DashboardLayout.tsx` lucide errors remain — unrelated, predate this, flagged in
  the task). `eslint`: clean on the file.
- **Live browser click-through NOT run by me** — `openclaw browser` navigation is
  policy-blocked in my session (returns "browser navigation blocked by policy"). The
  four-path dismiss check in a real browser is Scout's re-gate (he has the tooling +
  cleared the stale `.next` on :4014). Verified the fix by logic + static checks.
- `next build` still fails on the pre-existing `DashboardLayout.tsx` lucide type
  errors (not mine) so prod-build couldn't be exercised — flagged, unchanged by me.

**Status:** FE complete + pushed. Pinged Scout (re-gate) + Yumi w/ commit SHA.

---

## 2026-06-10 — Symmetric edit: matched/TACO line → "Bukan produk TACO"

**Scope (mine):** FE-only (KC verified no BE work). Queued after BUG-6 (confirmed
committed `0a5aa251` before starting). File: `app/taro-app/upload/[id]/page.tsx`.

### The gap
The resolve flow was one-directional out of competitor/unknown. A line **matched
as a TACO product** (`resolved_taco` "Yakin", or `perlu_dicek` with a SKU) could
only be SKU-edited via the pencil/Edit-SKU → `EditLineSheet` (SKU-only). KC: *"When
edit, I want to be able to mark 'Bukan produk TACO'."* — i.e. the exit OUT of TACO
needed to be reachable from the edit sheet too, mirroring Feature 2 (4e035dbe) in
reverse.

### What I built — minimal, reuse the EXACT same picker
Did **not** rebuild the competitor UI or replace `EditLineSheet` (kept its qty/price
edit so AC-4 doesn't regress). Instead:
- Added a **"Bukan produk TACO"** escape-hatch button at the bottom of
  `EditLineSheet` (new required `onReclassify` prop). Neutral outline, ≥48px,
  `XCircleIcon`, ID helper "Tandai sebagai produk kompetitor atau tidak diketahui."
- Parent **hands off** to the existing `CompetitorPickerSheet` — the *same*
  active-only, name-sorted brand tap-list + "Tidak diketahui" the unmatched
  ("Belum cocok") flow uses (`setClassifying(editing); setEditing(null)`). Batched
  state → only one sheet visible; no flicker.
- **Reload-durable:** verified in the BE service (`taro-invoices.service.ts:877-889`
  brand_id branch / `:870-876` is_unknown branch) that both clear `matched_sku_id`
  + `brand_id`/`is_unknown` and set `needs_review=false`. Mirrored that in the
  `CompetitorPickerSheet` optimistic patches — now also null out
  `matched_sku_id/code/name` so a previously-matched line stays "Kompetitor" /
  "Tidak diketahui" across reload (drives `resolveLine` → `needs_review`, the
  Scout-RE-GATE-5-validated resolved signal). No-op for already-unmatched
  belum_cocok lines.

### Symmetry now complete
- Matched/TACO line → Edit → pick a different SKU (existing) **OR** "Bukan produk
  TACO" → competitor picker / "Tidak diketahui" (NEW).
- Competitor/unknown line → "Ini produk TACO" + brand switch (4e035dbe, untouched).

### Quality / verification
- `tsc --noEmit`: 0 errors from my file (only the 2 pre-existing
  `DashboardLayout`/lucide errors remain — unrelated). `eslint`: clean.
- Impeccable critique pass — no blockers. One-orange rule holds (only "Simpan" is
  accent; the new button is neutral outline). No keyboard/text-input added (pure
  handoff to the tap-list picker), ID labels, ≥44px.
- **Live browser click-through NOT run by me** — no interactive browser tool in my
  session (only static web_fetch); the four-step click-through (matched line → Edit
  → "Bukan produk TACO" → pick brand → reload sticks) is Scout's smoke check, per
  the team flow. KC's hero invoice `be2d2d0d` is gone from the DB (seed churn);
  invoice `62f499c9` currently holds matched `needs_review=false` TACO lines as a
  live target for the re-gate.

**Status:** FE complete + pushed. status.json working→idle. Pinged Yumi w/ commit.

---

## 2026-06-10 — Remove redundant "back to Beranda" on Riwayat (history tab)

**Scope (mine):** FE-only, lowest-priority. Queued after BUG-6 (`0a5aa251`) and the
"Bukan produk TACO" symmetric edit (`c14ee383`) — both confirmed committed before
starting. File: `app/taro-app/history/page.tsx`.

### The ask (KC)
`/taro-app/history` (Riwayat) is a **primary bottom-nav tab**, so a "back to
Beranda" affordance in its header is redundant/wrong — the bottom nav already owns
navigation. Remove it on the history tab only; do **not** regress the legitimate
back button on the invoice detail screen (`/taro-app/upload/[id]`).

### What I changed
- Dropped the `right={…}` prop on history's `<TopBar>` — it was an inline
  `<button>` (ChevronLeftIcon + "Beranda") that `router.push("/taro-app/home")`.
  Now just `<TopBar title="Riwayat Upload" />`, which falls back to TopBar's default
  right slot (region badge) — **identical to the home tab's bare `<TopBar />`**, so
  primary tabs are now consistent (no back affordance).
- Removed the now-unused `ChevronLeftIcon` import from this file. `router` stays
  imported — still used for row → detail navigation (`router.push(/taro-app/upload/:id)`).

### Why detail pages are unaffected
The back button was defined **inline** in history's TopBar, not in a shared header.
The detail screen has its **own** independent back affordances
(`upload/[id]/page.tsx`: its own TopBar `right` ChevronLeftIcon at ~:427 + a
"Kembali ke Beranda" at ~:391) — untouched. `ChevronLeftIcon` still imported/used
there (and in the detail SKU sub-header ~:1658). No shared component edited → zero
blast radius beyond the history tab.

### Quality / verification
- `tsc --noEmit`: 0 errors from `history/page.tsx` (only the 2 pre-existing
  `DashboardLayout.tsx` lucide errors remain — unrelated, predate this). `eslint`:
  clean on the file.
- **Live browser click-through NOT run by me** — no interactive browser tool in my
  session; the visual check (Riwayat shows no back-to-Beranda; bottom nav works;
  detail still has its back) is Scout's smoke pass.

### Heads-up flagged (out of scope, not touched)
History row line ~193 still renders `{u.region_display ?? "—"}` — the same stray
em-dash pattern KC had me fix on the **home** card (`652a2d99`). Left it alone (this
task is scoped to the back button), but it's a candidate for the same `? : null`
fix if KC wants the dash gone here too.

**Status:** FE complete + pushed. status.json already `tile: idle`. Pinged Yumi w/ commit.

---

## 2026-06-10 — 3-item batch: BUG-6 (already done) + history thumbnails + remove header region badge

Yumi dispatched three FE items. Item 1 turned out already-shipped; items 2 & 3 done together.

### Item 1 — BUG-6 lightbox dismiss: ALREADY LANDED (no-op)
Re-dispatched, but my RE-GATE 6 fix is already in main (`0a5aa251`, see the
"RE-GATE 6 / BUG-6" entry above). Verified the **current** `ImageLightbox`
(`upload/[id]/page.tsx:866-944`) already has Scout's recommended shape:
`onCloseRef` stabilizes onClose; a single `pushState` guarded by
`window.history.state?.tacoLightbox` (idempotent under StrictMode); X/Esc/backdrop
call `onClose()` directly (state-driven unmount, **no** `history.back()` round-trip);
back-gesture additive via `popstate`; deps `[]`. Did NOT redo it. Flagged to Yumi
that Scout likely re-gated against a stale HEAD (the "HEAD never moved" pattern from
RE-GATE 4) — needs a re-gate against current main, not new code from me.

### Item 2 — History (Riwayat) row thumbnails ✅
`/taro-app/history` rows showed the `StoreIcon`. Now render the real invoice photo,
same treatment as home (`8179006d`).
- **Endpoint check (Yumi asked):** history calls `getTaroInvoices({limit:"100"})` →
  `GET /api/taro-invoices` — the **same** endpoint Grout added `image_url` to
  (`bdc786f4`), and `normalizeTaroInvoiceSummary` (lib/api.ts:944-965) already
  absolutizes `image_url` per row. So history **does** carry `image_url` — no BE
  gap, no stop/ping needed.
- Added a `RowThumbnail` to `history/page.tsx` mirroring home's component
  (`w-10 h-10`, `object-cover`, `overflow-hidden`, `loading="lazy"`), `StoreIcon`
  fallback on null/`onError`. Replaced the inline icon box. `StoreIcon` import stays
  (used in fallback).

### Item 3 — Remove "Wilayah ASM" region badge from the header ✅
KC: header shows the region ("Wilayah ASM") up top; doesn't want it — and "check
other screens too." The header region badge lived in **one** place: `TopBar`'s
default right slot (`region_display ?? region_code`). Removed it there → kills it
on **every** screen at once: home, history, notifications, upload, upload-detail
(all use `<TopBar/>`'s default slot). Single-point fix, exactly "wherever it appears."
- `TopBar.tsx`: dropped the region `<span>`, the `useAuthStore` import, the
  `regionDisplay`/`user` logic, and the now-unused `hideRegion` prop. `right` is
  still honored (upload-detail's back button etc. unaffected). Default right slot
  now renders nothing.
- `profile/page.tsx`: removed the now-invalid `hideRegion` prop from its `<TopBar>`.
- **Left intact + flagged for KC:** the **Profil body** field labeled "Wilayah ASM"
  (`profile/page.tsx:107`, a deliberate profile detail row, NOT a header element)
  and the per-invoice region shown inside home/detail **cards** (row content, not
  header). KC's ask was the header badge; flagged these so he can say if he wants
  them gone too.

### Quality / verification
- `tsc --noEmit`: 0 errors from my files (only the 2 pre-existing
  `DashboardLayout`/lucide errors remain). `eslint`: clean — the one warning is the
  pre-existing TACO-logo `<img>` in TopBar (untouched, `next/image` advisory, not an
  error). Impeccable pass on the diff — no blockers.
- **Live browser click-through NOT run by me** — no interactive browser in-session;
  the visual check (history rows show photos w/ icon fallback; no region badge in any
  header; detail back button still present) is Scout's smoke pass.

**Status:** Items 2+3 FE complete + pushed; item 1 already in main (no change).
status.json `tile: idle`. Pinged Yumi w/ commit + endpoint answer.
