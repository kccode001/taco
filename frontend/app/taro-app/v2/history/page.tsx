"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listV2Invoices,
  getV2ImageUrl,
  deleteV2Invoice,
  type InvoiceV2,
} from "@/lib/v2/invoices";
import { TopBar } from "../../_components/TopBar";
import { useTaroGuard } from "../../_components/useTaroGuard";
import { timeAgo } from "../../_components/mockUploads";
import { SearchIcon, StoreIcon, TrashIcon } from "../../_components/icons";
import { BottomNavV2 } from "@/components/pwa-v2/BottomNavV2";
import { ImageLightboxV2 } from "@/components/pwa-v2/ImageLightboxV2";

function dateOf(inv: InvoiceV2): string {
  return inv.created_at ?? "";
}

function RowThumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <div className="w-10 h-10 rounded-lg bg-taco-page border border-taco-divider flex items-center justify-center text-taco-sub flex-shrink-0 overflow-hidden">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <StoreIcon size={18} />
      )}
    </div>
  );
}

function DeleteConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-2xl px-5 pt-5 pb-8 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[16px] font-semibold text-taco-text text-center">
          Hapus invoice ini?
        </div>
        <div className="text-[13px] text-taco-sub text-center leading-relaxed">
          Invoice dan fotonya akan dihapus permanen.
        </div>
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[52px] rounded-xl border border-taco-border text-taco-text text-[15px] font-medium active:bg-taco-page"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 min-h-[52px] rounded-xl bg-red-500 text-white text-[15px] font-semibold active:bg-red-600"
          >
            Ya, Hapus
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaroV2HistoryPage() {
  const { ready } = useTaroGuard();
  const [rows, setRows] = useState<InvoiceV2[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listV2Invoices({ limit: 100 });
      setRows(res.items);
    } catch (err) {
      setRows([]);
      const message =
        (err as { message?: string })?.message ?? "Tidak bisa memuat data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => {
      const hay = `${r.store?.name ?? ""} ${r.area?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  // Signed thumbnails for the currently visible rows (cap 30).
  useEffect(() => {
    let alive = true;
    (async () => {
      const targets = filtered
        .slice(0, 30)
        .filter((r) => r.thumb_image_id && !thumbs[r.id]);
      if (targets.length === 0) return;
      const resolved = await Promise.all(
        targets.map(async (r) => {
          const url = await getV2ImageUrl(r.thumb_image_id as string);
          return [r.id, url] as const;
        })
      );
      if (!alive) return;
      setThumbs((prev) => {
        const next = { ...prev };
        for (const [id, url] of resolved) if (url) next[id] = url;
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [filtered, thumbs]);

  async function openPreview(inv: InvoiceV2) {
    // Use already-loaded thumbnail URL if available; otherwise fetch on demand.
    if (thumbs[inv.id]) {
      setPreview(thumbs[inv.id]);
      return;
    }
    if (!inv.thumb_image_id) return;
    const url = await getV2ImageUrl(inv.thumb_image_id);
    if (url) {
      setThumbs((prev) => ({ ...prev, [inv.id]: url }));
      setPreview(url);
    }
  }

  async function confirmDelete() {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try {
      await deleteV2Invoice(deleteId);
      setRows((prev) => prev.filter((r) => r.id !== deleteId));
      setThumbs((prev) => {
        const next = { ...prev };
        delete next[deleteId];
        return next;
      });
    } catch {
      // silently ignore; row stays in list
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen pb-[96px]">
        <TopBar title="Riwayat Upload" />

        {/* Search */}
        <div className="bg-white border-b border-taco-divider px-4 py-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-taco-muted">
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama toko atau area…"
              className="w-full h-[44px] pl-10 pr-3 border border-taco-border rounded-xl text-[14px] text-taco-text bg-white outline-none focus:border-taco-text"
            />
          </div>
        </div>

        {/* List */}
        <section className="px-4 pt-3 flex-1">
          {loading ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Memuat…
            </div>
          ) : error ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center">
              <div className="text-[14px] text-taco-error">
                Gagal memuat: {error}
              </div>
              <button
                type="button"
                onClick={() => load()}
                className="mt-3 text-[13px] text-taco-accent font-medium"
              >
                Coba lagi
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-taco-border rounded-xl p-6 text-center text-[14px] text-taco-muted">
              Tidak ada upload yang cocok.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((u) => (
                <div
                  key={u.id}
                  className="w-full bg-white border border-taco-border rounded-xl px-4 py-3 min-h-[80px] flex items-start gap-3"
                >
                  {/* Tap thumbnail to preview image */}
                  <button
                    type="button"
                    onClick={() => openPreview(u)}
                    className="flex-shrink-0 active:opacity-70"
                    aria-label="Lihat foto invoice"
                  >
                    <RowThumbnail src={thumbs[u.id]} />
                  </button>

                  {/* Main content — tap row body to preview image */}
                  <button
                    type="button"
                    onClick={() => openPreview(u)}
                    className="flex-1 min-w-0 text-left active:opacity-70"
                  >
                    <div className="text-[15px] font-medium text-taco-text truncate">
                      {u.store?.name ?? "Toko Tidak Disebutkan"}
                    </div>
                    <div className="text-[12px] text-taco-sub mt-0.5 truncate">
                      {u.area?.name ?? "—"}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {/* Always show Selesai — field reps don't need processing nuance */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-taco-success">
                        <span className="w-1.5 h-1.5 rounded-full bg-taco-success" />
                        Selesai
                      </span>
                      {(u.line_count ?? 0) > 0 && (
                        <span className="text-[11px] text-taco-sub">
                          {u.line_count} baris
                        </span>
                      )}
                      <span className="text-[11px] text-taco-muted ml-auto">
                        {timeAgo(dateOf(u))}
                      </span>
                    </div>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => setDeleteId(u.id)}
                    aria-label="Hapus invoice"
                    className="flex-shrink-0 w-[44px] h-[44px] flex items-center justify-center text-taco-muted active:text-taco-error rounded-lg"
                  >
                    <TrashIcon size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNavV2 />

      {preview && (
        <ImageLightboxV2 src={preview} onClose={() => setPreview(null)} />
      )}

      {deleteId && (
        <DeleteConfirmDialog
          onConfirm={confirmDelete}
          onCancel={() => !deleting && setDeleteId(null)}
        />
      )}
    </div>
  );
}
