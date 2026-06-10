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

---

## 2026-06-10 — Dashboard invoice list: default sort newest-upload-first

**Scope (mine):** FE-only. File: `app/taro/invoices/page.tsx` (the **dashboard**
table at `/taro/invoices` "Daftar Invoice Taro" — NOT the PWA `/taro-app/*`).

### The ask (KC)
The invoice list table must default-sort by **latest uploaded invoice first**
(newest at top), against the real upload timestamp — not id or OCR-status order.

### Timestamp field check (Yumi asked: FE-side or route to Grout?)
The list payload carries a usable upload time: the row mapper already sets
`uploaded_at: String(r.uploaded_at ?? r.created_at ?? "")` (page.tsx:131), and
`TaroInvoiceSummary.uploaded_at` is a required string. So **FE-side sort, no BE
change needed** — didn't route anything to Grout.

### What I changed
- Added `uploadedAtMs(i)` helper — parses `uploaded_at` to epoch ms, maps
  missing/invalid to `0` so a bad date sorts to the bottom instead of
  NaN-poisoning the comparator.
- The existing `filtered` useMemo now sorts its result
  `rows.sort((a,b) => uploadedAtMs(b) - uploadedAtMs(a))` → descending, newest
  first. `.filter` already returns a fresh array so the in-place sort doesn't
  mutate `invoices`. Sort is inside the memo (deps unchanged: invoices, pill,
  region, dates, search), so it re-applies on every fetch/filter change.
- **Survives reload:** the sort is recomputed from re-fetched data on every mount
  — no persisted/stateful ordering to go stale.

### Quality / verification
- `tsc --noEmit`: 0 errors from the file. `eslint`: clean.
- Logic-verified the comparator (descending by ms, invalids last). Live
  click-through / reload check is Scout's smoke pass (no interactive browser
  in-session).

**Status:** FE complete + pushed. status.json `tile: idle`. Pinged Yumi w/ commit.

---

## 2026-06-10 — Dashboard invoice list: "Invoice ID" column shows real id (not file_name)

**Scope (mine):** FE-only. File: `app/taro/invoices/page.tsx` (dashboard table
`/taro/invoices` "Daftar Invoice Taro" — NOT the PWA `/taro-app/*`).

### The ask (KC)
The "Invoice ID" column rendered the uploaded **image/file name** (e.g. "U001.
Nota Alfalah Tegal.jpeg") instead of the actual invoice identifier. Also confirm
the newest-upload-first default sort is in place.

### What I changed — Invoice ID column
The row mapper built `short_id` with a `file_name` fallback:
`short_id = r.short_id ?? (fileName ? fileName.replace(/\.[^.]+$/,"") : id.slice(0,8))`.
The BE list query (`taro-invoices.service.ts:683-695`) serializes **no** `short_id`,
so that fallback resolved to the **filename** — exactly KC's bug. Replaced it with
`short_id = (r.short_id) ?? id.slice(0,8)` — the canonical 8-char invoice id prefix
the team refers to invoices by (e.g. `2af91218`), derived from the same `id` the
detail link (`/taro/invoices/${inv.id}`) uses, so the shown id always matches the
record. The cell render (`inv.short_id`, font-mono, line ~405) was already correct;
only the value source changed. Chose the 8-char prefix over the full UUID — it's the
team's canonical handle and keeps the table column readable on mobile + desktop.

### Sort — already in place (confirmed, no change)
Default newest-upload-first sort shipped previously (`d8ef003c`): the `filtered`
useMemo ends with `rows.sort((a,b) => uploadedAtMs(b) - uploadedAtMs(a))` (descending)
using the `uploadedAtMs` helper (`uploaded_at` → epoch ms, invalid→0→bottom). Intact
after the `fae57f16` revert (that revert only touched `taro-app/home/page.tsx`).
Recomputed from re-fetched data every mount → survives reload.

### Quality / verification
- `tsc --noEmit`: 0 errors from the file. `eslint`: clean.
- Live click-through is Scout's smoke pass (no interactive browser in-session).

### ⚠️ Heads-up flagged to Yumi (unrelated to this task)
My last commit `cf178752` (home owner-filter fix, "show all BE-scoped uploads") was
**reverted** at `fae57f16`. The home list now shows the client owner re-filter again
— i.e. the `/taro-app/home` "missing invoice" bug (`2af91218` shown in Riwayat but
not home) is likely **back**. Did not touch it (out of scope here); flagged for Yumi
to decide whether to re-apply or pursue the BE-side identity reconciliation instead.

**Status:** FE complete + pushed. status.json `tile: idle`. Pinged Yumi w/ commit.

---

## 2026-06-10 — Remove "Upload Invoice" button from `/taro/invoices` dashboard

**Scope (mine):** FE-only. File: `app/taro/invoices/page.tsx` (dashboard table
`/taro/invoices` "Daftar Invoice Taro" — NOT the PWA `/taro-app/*` upload flows).

### The ask (KC)
Remove the "+ Upload Invoice" button from the dashboard invoice table page.

### What I changed
Removed the `<Link href="/taro/invoices/upload">+ Upload Invoice</Link>` button
that sat in the page header (was `page.tsx:234-239`). It was the only child paired
with the heading inside a `flex items-start justify-between` wrapper whose sole
purpose was to push the button to the right of the title — so I collapsed that
wrapper and the redundant inner `<div>` too, leaving just the bare `<h1>` ("Daftar
Invoice Taro"). No dead wrappers, no orphaned layout classes.

- `Link` import (`next/link`, line 3) **kept** — still used by the row
  click-through `<Link href={`/taro/invoices/${inv.id}`}>` (~line 432). Verified
  it's the only remaining consumer; no other handler/state/import was tied to the
  removed button.
- Did not touch `/taro-app/*` PWA upload flows, nor the unrelated uncommitted
  change in `app/admin/taro-invoices/page.tsx` (not mine — left as-is).

### Quality / verification
- `tsc --noEmit`: clean (0 errors from the file).
- `eslint app/taro/invoices/page.tsx`: exit 0, clean (no unused-var/import).

**Status:** FE complete. Committing `page.tsx` + this ledger only; pushing to main.

---

## 2026-06-10 — Remove "Upload Invoice" button from `/taro/dashboard` (follow-up)

**Scope (mine):** FE-only. File: `app/taro/dashboard/page.tsx` (`/taro/dashboard`
"Taro Dashboard" — NOT the PWA `/taro-app/*`). Sibling to the `/taro/invoices`
button removal (`cfd82544`); separate commit since that was already pushed.

### The ask (KC)
Remove the "+ Upload Invoice" button from the Taro Dashboard page too.

### What I changed
Removed the `<Link href="/taro/invoices/upload">+ Upload Invoice</Link>` button in
the page header (was `page.tsx:196-201`) and collapsed the `flex justify-between`
wrapper + redundant inner `<div>` (only there to position the button beside the
title), leaving the bare `<h1>` ("Taro Dashboard").

- Unlike the invoices page, `Link` was the **sole** consumer here, so I also
  dropped the now-unused `import Link from "next/link"` (was line 3) — no
  unused-import lint. No other handler/state/import was tied to the button.
- Left the empty-state copy "Upload invoice pertama Anda dari aplikasi sales
  agent." (line ~241) — that's descriptive text, not a button.
- Did not touch `/taro-app/*` PWA flows.

### Quality / verification
- `tsc --noEmit`: clean (0 errors from the file).
- `eslint app/taro/dashboard/page.tsx`: exit 0, clean.

**Status:** FE complete. Committing `page.tsx` + this ledger only; pushing to main.

---

## 2026-06-10 — Remove "Salin ke Rekomendasi" action from `/taro/failed-ocr`

**Scope (mine):** FE-only. File: `app/taro/failed-ocr/page.tsx` (`/taro/failed-ocr`
"OCR Gagal" — NOT the PWA `/taro-app/*`). Third in the button-removal batch with
`/taro/invoices` (`cfd82544`) + `/taro/dashboard` (`0daaa27c`).

### The ask (KC)
Remove the "Salin ke Rekomendasi" button/action from the OCR Gagal page.

### What I changed
This button owned a small cluster of state/logic; removed the button plus
everything it was the sole consumer of:
- Button `<button onClick={handleCopyToRecommendations}>` (was `page.tsx:330-337`);
  collapsed the `flex justify-between` header wrapper → bare `<h1>` ("OCR Gagal").
- Handler `handleCopyToRecommendations` (was 293-306) — only the button called it.
- State `const [copying, setCopying]` (was 204) — only used by handler + button.
- State `const [toast, setToast]` (was 206) **and** its bottom-right toast render
  block (was 577-584). `setToast` was called **only** inside the removed handler,
  so the toast mechanism existed solely to give this action feedback — removing the
  button orphaned it entirely. Dropped both to avoid a never-called-setter lint.
- Import `regenerateTaroRecommendations` (from `@/lib/api`, was line 7) — only the
  handler used it on this page; dropped from the import list.
- Import `SparkleIcon` (was line 11) — only the button used it; kept `SearchIcon`
  (still used by the search field).

### BE note (no action taken)
`regenerateTaroRecommendations` is a real BE call, but it is **NOT** orphaned —
still consumed by `app/taro/recommendations/page.tsx:213` and
`app/admin/taro-invoices/recommendations/page.tsx:109`. So no BE/lib cleanup
needed and nothing to flag. FE-only stayed FE-only.

### Quality / verification
- `tsc --noEmit`: clean (0 errors from the file).
- `eslint app/taro/failed-ocr/page.tsx`: exit 0, clean (no unused var/import).

**Status:** FE complete. Committing `page.tsx` + this ledger only; pushing to main.

---

## 2026-06-10 — Recolor "Regenerate" button to brand orange on `/taro/recommendations`

**Scope (mine):** FE-only. File: `app/taro/recommendations/page.tsx`
(`/taro/recommendations` — NOT the PWA `/taro-app/*`). Fourth item in the batch.

### The ask (KC)
Make the "Regenerate" button the primary brand orange — using the existing token,
not a one-off hex; hover/active/disabled consistent with other primary buttons.

### What I changed
Button at `page.tsx:300`. Was `bg-taco-text` (dark) + `hover:opacity-90`. Swapped
to the app's canonical primary-action recipe:
`bg-taco-accent` + `hover:bg-taco-accent-dark` (kept `disabled:opacity-60`).

- `taco-accent` = `#F04E23` (orange) — the brand primary token defined in
  `tailwind.config.ts:22`; `taco-accent-dark` = `#C93A10` (`:23`) is the standard
  hover. Same classes the other TACO primary buttons use (the Upload Invoice /
  Salin buttons I just touched all used `bg-taco-accent hover:bg-taco-accent-dark
  disabled:opacity-60`). No new hex introduced — token only.
- Only the color/hover classes changed; geometry, icon, label, handler untouched.

### Quality / verification
- `tsc --noEmit`: clean. `eslint`: exit 0, clean.

**Status:** FE complete. Committing `page.tsx` + this ledger only; pushing to main.

---

## 2026-06-10 — TACO v2 BUILD (Pair A FE): PWA v2 upload flow [milestone 1]

**Context:** KC overrode the pipeline (no PRD/design gate, code direct). v1 FROZEN
— add-new-never-mutate. Build contract: `projects/taco/v2/BUILD-PLAN-v2.md`. I own
PWA v2 upload (`taro-app/v2/*`) + admin v2 invoice detail (`taro/v2/*`).

**Coordination notes (read these next time):**
- Two project trees that have DRIFTED: code+git live at `/Users/kc-testing/projects/taco`;
  the planning docs (BUILD-PLAN-v2, PROJECT-BRIEF-v2) + a STALE ledger mirror live at
  `/Users/kc-testing/.openclaw/workspace/projects/taco`. **The git-tracked ledger here
  is authoritative** — I append + commit THIS one.
- Grout published canonical v2 entities at `backend/src/database/entities/v2/*` (untracked):
  AreaV2, StoreV2, SalesAgentV2, InvoiceV2 (status: validating→ocr_processing→needs_review
  →done), InvoiceImageV2 (validation_status pending|valid|invalid + invalid_reason ID),
  InvoiceLineItemV2 (9-bucket `classification` enum + confidence_band + matched_sku_id /
  brand_id / is_competitor / mismatch_reason). I mirrored those shapes exactly.
- **Mosaic (Pair B FE) already created `lib/v2/api.ts` + `lib/v2/types.ts`** (areas/stores/
  sales/recommendations/dashboard). It has NO invoice/image/line-item helpers. To avoid two
  FE engineers contending on one file, I added a **sibling `lib/v2/invoices.ts`** (mine)
  that reuses Mosaic's `unwrapList`/`unwrapOne` + `AreaV2`/`StoreV2` types. Mosaic: import
  from `lib/v2/invoices.ts` if you need invoice shapes — don't redefine.

**What I built (milestone 1, FE-only):**
- `frontend/lib/v2/invoices.ts` — v2 invoice/image/line-item API client + entity-shaped
  DTOs. Defensive response unwrap (`T` | `{data}` | `{images:[]}`) since BE DTOs may settle.
  Endpoints per BUILD-PLAN: create invoice, upload images (multipart), validate (re-checks
  only `pending`), delete image, process (kick OCR), getV2Invoice, patchV2LineItem (admin).
- `frontend/app/taro-app/v2/upload/page.tsx` — 3-step + success PWA flow:
  - Step 1 (Toko): Area tap-list (`GET /v2/areas`) + Store autocomplete filtered by area
    (`GET /v2/stores?area_id=`) with **free-type-new-store** → `POST /v2/stores` on Lanjut,
    saved for next time. Text input only — NO keyboard icon.
  - Step 2 (Foto): camera (capture=environment) + gallery multi-select, local thumbnails +
    inline delete pre-upload.
  - Step 3 (Validasi): `POST /v2/invoices/:id/images` then poll `POST .../validate` while any
    image `pending` (BE re-checks only pending). Per-image cards: valid/invalid/pending with
    **Indonesian invalid_reason**; delete-invalid inline; add-more (camera/gallery) re-uploads
    + re-validates. "Selesai & Proses" enabled **only when every image valid** → `POST .../process`.
  - Step 4: success screen.
  - Reuses v1 tokens (taco-accent #F04E23, taco-* system), TopBar, icons, useTaroGuard.
    ONE-orange rule held (only primary CTAs are accent; status uses semantic success/error/info).

**Quality:** `tsc --noEmit` clean on both my files (only the 2 pre-existing DashboardLayout
lucide errors remain — unrelated). `eslint` clean on both.

**Dependencies / honest flags:**
- `GET /v2/areas` + `/v2/stores` are Mortar's (Pair B BE). If not live yet the area list shows
  a graceful "Belum ada area" empty state — no crash. Wire is correct to the contract.
- `POST /v2/invoices/:id/images|validate|process` + `DELETE /v2/invoice-images/:id` are Grout's
  (Pair A BE) — in flight. No interactive browser in-session → live click-through is Scout's gate.

**Status:** milestone 1 (PWA upload) complete + pushed. Admin v2 invoice-detail (milestone 2)
next — copy-forward v1 resolve UI into `taro/v2/*`.

---

## 2026-06-10 — TACO v2 BUILD (Pair A FE): admin v2 invoice detail + resolve [milestone 2] — RESTART after crash

**Context:** v2 session crashed ~21:50 (infra). PWA upload (milestone 1) survived — committed
`cb28bc57` pre-crash. Admin v2 invoice detail was untracked WIP from the crashed run; recovered
+ finished it this run, reconciled against Grout's NOW-canonical v2 spine.

**Grout's canonical spine landed (`37f2fde8`):** entities `backend/src/database/entities/v2/*`,
spine module `backend/src/taro-v2/*`. Read the real controllers/DTOs/service (code = source of
truth) and reconciled my FE against them.

**What I built / finished — `app/taro/v2/invoices/[id]/page.tsx` (admin, desktop):**
- Copy-and-ADAPTED from v1 PWA resolve UI (v1 FROZEN, untouched). Loads `GET /v2/invoices/:id`,
  renders images (left) + line items (right) with the 9-bucket `classification` taxonomy.
- Per-line display engine drives off `classification` + explicit resolve fields
  (`matched_sku_id` / `is_competitor` / `brand_id`): review-bucket (low_verify/unreadable/unknown)
  → "Perlu Dicek" amber; very/high → auto-accepted (editable); resolved → TACO / Kompetitor.
- **Resolve modal:** map a TACO SKU (search shared `/taco-skus`) OR mark competitor brand
  (shared `/competitor-brands`, active-only) OR "Tidak diketahui". Captures **`mismatch_reason`**
  (required) when the admin flips a line across the TACO↔not-TACO boundary the system predicted —
  fuel for the recommendation engine. Esc-to-close (state-driven, no history funnel → avoids v1 BUG-6).
- Header status badge recomputed from line states so it never contradicts the rows.

**CONTRACT RECONCILIATION (drift caught vs Grout's BE):**
1. **Images were broken** — BE `findOne` returns images with `file_path`, NOT a `url`; images are
   JWT-gated at `GET /v2/invoice-images/:id/image` so a plain `<img src>` can't auth. FIX: added
   `getV2ImageUrl()` (`lib/v2/invoices.ts`) hitting `GET /v2/invoice-images/:id/image-url` → signed
   `?token=` URL the JwtStrategy accepts; admin page fetches one per image on load (Promise.all),
   falls back to a placeholder card on failure. **This was the critical fix — without it the admin
   sees no invoice photo.**
2. **No `reason` field in v2** — v1's `PatchLineItemV2Dto` had `reason`; v2's does NOT (only
   `mismatch_reason`). Global ValidationPipe is `whitelist:true` (NO forbidNonWhitelisted) → the
   stray `reason` my client still sends is silently stripped, harmless. Mismatch capture rides
   `mismatch_reason` (correct).
3. Added `failed` to the FE status union + STATUS_META (BE enum has FAILED); guarded
   `recomputeStatus` so it never overrides validating/ocr_processing/failed.

**Resolve response shape (confirmed):** BE returns `{ line_item, invoice_status, invoice_status_label }`.
My modal builds the optimistic line patch locally and reads `readInvoiceStatus(resp)` (top-level
`invoice_status`) for the header — works regardless of the nested `line_item`.

**GOTCHA for next run:** BE `findOne` does NOT join `area`/`store` relations (only images +
line_items) → admin header shows "Toko —/Area —". FE degrades gracefully; flagged to Grout to add
area/store (or denormalized names) to `findOne` so the header reads the store/area. Also no
`confirm_as_is` ("Sudah benar") affordance yet for review-bucket lines the admin agrees with but
can't map a SKU to — BE supports it; FE enhancement if KC wants it.

**Quality:** `tsc --noEmit` clean on both files; `eslint` clean (removed an unused `router`).

**Status:** milestone 2 (admin v2 invoice detail + resolve) complete. Committing my 2 files +
this ledger only (NOT Grout's in-flight backend/src/v2 or grout.md). Pushing to main. Pinging Yumi.
Pushed `2c759f80`.

---

## 2026-06-10 — TACO v2 BUILD (Pair A FE): admin resolve QUEUE list [milestone 3]

**What I built — `app/taro/v2/invoices/page.tsx` (admin queue, new):**
- The resolve QUEUE that was missing — closes the spine demo path (PWA upload → validate → OCR
  9-bucket → **queue** → detail/resolve). Lists v2 invoices via `GET /v2/invoices`
  (`listV2Invoices()` added to `lib/v2/invoices.ts`, normalizes `{items,total,page,limit}`),
  default filter `status=needs_review` (the admin's primary job), with status tabs
  (Perlu Review / Proses OCR / Validasi / Selesai / Gagal / Semua). Each row → `/taro/v2/invoices/[id]`.
- **Client-side name join:** BE `list()` returns BARE invoice rows (no area/store relations), so I
  map `area_id`/`store_id` → names off Mosaic's small Areas/Stores lists (`getAreas`/`getStoresV2`)
  client-side; falls back to id prefix if those aren't loaded. (Same root gap as `findOne` — flagged
  to Grout to join names server-side; FE works without it.)
- Status chips reuse the v2 palette; loading/empty/error states; "Muat ulang".

**Nav (one shared-file edit, flagged):** added an "Antrian" tab to `_components/V2Tabs.tsx`
(Mosaic's file — was clean in the working tree) so the queue is reachable. Surgical: one icon
import (`Inbox`) + one array entry between Dashboard and Area. @Mosaic FYI — if you re-org the tabs,
keep an entry pointing at `/taro/v2/invoices`.

**Quality:** `tsc --noEmit` + `eslint` clean on all touched files.

**Status:** milestone 3 (resolve queue) complete. Spine FE now demoable end-to-end (pending live BE).
Committing my queue page + `lib/v2/invoices.ts` + `V2Tabs.tsx` + this ledger. Pushing. Pinging Yumi.
