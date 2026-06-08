# Task — Wire `needs_review` invoice status into FE

**Agent:** Quill
**Date:** 2026-06-08
**Branch:** `feat/taro-needs-review-status-fe`
**Status:** done

## Spec

BE now emits `'queued' | 'processing' | 'done' | 'needs_review' | 'failed'` for
Taro invoice status. After OCR finishes, if ANY line item has low confidence /
no SKU match, BE sets status to `needs_review`; PATCHing a line item to fix it
can flip back to `done`. FE was previously rendering `done` even when 5/5 lines
were flagged.

## Files Changed

1. `frontend/lib/api.ts` — `TaroInvoiceStatus` widened to include `queued`
   (BE-canonical) alongside legacy `pending`.
2. `frontend/app/taro-app/_components/icons.tsx` — added `AlertTriangleIcon`,
   `SpinnerIcon`, `XCircleIcon` inline SVGs.
3. `frontend/app/taro-app/_components/mockUploads.ts` — `statusLabel` /
   `statusTone` extended with explicit `queued` / `pending` mapping to
   "Antrian" + new `muted` tone.
4. `frontend/app/taro-app/upload/[id]/page.tsx` — PWA review screen.
   - Banner is now status-aware: green (done) / amber + warning icon
     (needs_review) / blue + spinner (processing) / red (failed).
   - Confidence summary expanded from 2 pills to 3 (Yakin / Perlu Cek /
     Perlu Review) so the user sees the breakdown that drove the status.
   - Bottom CTA: needs_review now shows "Tandai Selesai (N baris belum
     siap)" disabled in amber with hint text under it ("Edit baris bertanda
     Perlu Review di atas untuk mengaktifkan tombol ini.").
5. `frontend/app/taro-app/home/page.tsx` — TONE maps widened to include
   `muted`; line_count + confidence info now shown for needs_review too.
6. `frontend/app/taro-app/history/page.tsx` — same TONE widening + info-row
   reveal for needs_review.
7. `frontend/app/taro/invoices/page.tsx` — Dashboard list:
   - Filter pills: Semua | Selesai | Perlu Review | Proses | Gagal (added
     Gagal; renamed Sudah Selesai → Selesai).
   - Refetch now sends `?status=needs_review` (was `needs_review=true`).
   - Client-side filter handles failed pill.
   - `queued` / `pending` badge now reads "Antrian" muted.
8. `frontend/app/taro/invoices/[id]/page.tsx` — admin detail badge: queued
   maps to "Antrian" muted.

## Verification

- `tsc --noEmit` clean for all touched files (project total error count
  unchanged at 2 pre-existing DashboardLayout lucide types).
- BE confirmed both test invoices already flipped to `needs_review`:
  - `10d06653-2f54-4689-9542-550e98b1bd93` — 5 lines / 5 low-conf
  - `d546eea9-4ecb-4b53-8212-3d0c1d191f1c` — 18 lines / 11 low-conf

## Screenshots

- `/tmp/pwa-review-needs-review-amber.png` — invoice `10d06653…` shows
  amber banner ("Invoice butuh review. 5 dari 5 baris perlu dicek
  manual…"), 0 Yakin · 2 Perlu Cek · 3 Perlu Review summary, and the
  amber disabled "Tandai Selesai (5 baris belum siap)" CTA.
- `/tmp/dashboard-list-with-needs-review.png` — both test invoices in
  the list with amber "Perlu Review" status pill.
- `/tmp/dashboard-filter-perlu-review.png` — Perlu Review filter pill
  active (dark), list scoped to needs_review only (both invoices).
