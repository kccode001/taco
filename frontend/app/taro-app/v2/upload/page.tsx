"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { getAreas, getStoresV2, unwrapList } from "@/lib/v2/api";
import type { AreaV2, StoreV2 } from "@/lib/v2/types";
import {
  detectV2StoreLocation,
  batchCreateV2Invoices,
  getV2ImageUrl,
  type DetectStoreResponse,
  type BatchInvoiceGroupInput,
  type BatchCreateResponse,
} from "@/lib/v2/invoices";
import { TopBar } from "../../_components/TopBar";
import { useTaroGuard } from "../../_components/useTaroGuard";
import { ImageLightboxV2 } from "@/components/pwa-v2/ImageLightboxV2";
import {
  CameraIcon,
  CheckIcon,
  CloseIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  XCircleIcon,
  ChevronRightIcon,
  RefreshIcon,
  TrashIcon,
  PencilIcon,
} from "../../_components/icons";

/** Batch photo-first flow phases:
 *  pick    → rep multi-picks invoice photos; each detects independently
 *  review  → live auto-grouped review/regroup screen BEFORE any invoice exists
 *  success → batch committed; per-group result summary */
type Phase = "pick" | "review" | "success";

/** Per-photo detection lifecycle. */
type PhotoStatus = "detecting" | "ready" | "error";

const ACCEPTED = ["image/jpeg", "image/png", "image/jpg"];
const ACCEPT_ATTR = "image/jpeg,image/png";
/** Cap concurrent vision calls — reps may snap many; don't hammer the BE / burn
 *  the metered vision tier all at once (KC cost discipline). */
const MAX_CONCURRENT_DETECT = 4;

/** A resolved store+area assignment — the grouping key + display labels. */
interface Assignment {
  areaId: string;
  areaName: string;
  areaCode?: string;
  /** null when the store is free-typed (no master match → BE persists by name). */
  storeId: string | null;
  storeName: string;
}

interface BatchPhoto {
  id: string;
  thumb: string;
  status: PhotoStatus;
  detect: DetectStoreResponse | null;
  error: string | null;
  /** Rep-applied correction (AC-7). Overrides the detected assignment. */
  override: Assignment | null;
}

/** Where a photo lands once detection settles. */
type Resolved =
  | { kind: "pending" } // still detecting (or detect errored — re-runnable)
  | { kind: "invalid"; reason: string }
  | { kind: "needs"; areaHint: AreaV2 | null } // no resolvable store (AC-5)
  | { kind: "grouped"; assignment: Assignment };

interface Group {
  key: string;
  areaId: string;
  areaName: string;
  areaCode?: string;
  storeId: string | null;
  storeName: string;
  photoIds: string[];
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p_${Math.round(performance.now())}_${Math.floor(performance.now() % 99999)}`;

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join(", ");
    if (typeof msg === "string") return msg;
    if (data?.error) return data.error;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Terjadi kesalahan tidak diketahui.";
}

/** Resolve one photo into its bucket. Grouping is GATED on the detect outcome:
 *  only `auto`/`best_guess` auto-group. On the `manual` band the BE may return a
 *  weak sub-threshold non-null match (see TACO-PF-01) — never auto-group from it,
 *  or photos collapse under the wrong store. Manual → needs-input until the rep
 *  assigns by hand. A rep override always wins. */
function resolvePhoto(p: BatchPhoto, areas: AreaV2[]): Resolved {
  if (p.status !== "ready" || !p.detect) return { kind: "pending" };
  if (p.override) return { kind: "grouped", assignment: p.override };

  const d = p.detect;
  if (d.outcome === "invalid") {
    return {
      kind: "invalid",
      reason:
        d.validation.invalid_reason ??
        "Foto tidak memenuhi syarat (buram / terpotong / bukan nota).",
    };
  }

  if (d.outcome === "auto" || d.outcome === "best_guess") {
    const areaId = d.area_match?.id ?? d.store_match?.area_id ?? null;
    if (areaId) {
      const areaRow = areas.find((a) => a.id === areaId) ?? null;
      const areaName = d.area_match?.name ?? areaRow?.name ?? "Area";
      const areaCode = d.area_match?.code ?? areaRow?.code;
      // Matched store → key by store id.
      if (d.store_match) {
        return {
          kind: "grouped",
          assignment: {
            areaId,
            areaName,
            areaCode,
            storeId: d.store_match.id,
            storeName: d.store_match.name,
          },
        };
      }
      // No store match but a printed store name → free-typed group key.
      const raw = d.detected.store_name_raw?.trim();
      if (raw) {
        return {
          kind: "grouped",
          assignment: {
            areaId,
            areaName,
            areaCode,
            storeId: null,
            storeName: raw,
          },
        };
      }
    }
  }

  // No resolvable store (manual band, or valid-but-no-store-printed) → needs
  // input. Carry the area as a hint if the BE matched one (AC-6: no-store but
  // valid is needs-input, NOT invalid).
  const hintId = p.detect.area_match?.id ?? null;
  const areaHint = hintId ? areas.find((a) => a.id === hintId) ?? null : null;
  return { kind: "needs", areaHint };
}

const groupKey = (a: Assignment) =>
  `${a.areaId}::${a.storeId ? `id:${a.storeId}` : `name:${normName(a.storeName)}`}`;

// ── Inline store autocomplete + area picker, used by AssignSheet ─────────────
function AssignSheet({
  areas,
  areasLoading,
  title,
  initial,
  onCancel,
  onSave,
}: {
  areas: AreaV2[];
  areasLoading: boolean;
  title: string;
  initial: { areaId?: string; storeId?: string | null; storeName?: string } | null;
  onCancel: () => void;
  onSave: (a: Assignment) => void;
}) {
  const [area, setArea] = useState<AreaV2 | null>(
    initial?.areaId ? areas.find((a) => a.id === initial.areaId) ?? null : null
  );
  const [areaListOpen, setAreaListOpen] = useState(!initial?.areaId);
  const [areaQuery, setAreaQuery] = useState("");
  const [stores, setStores] = useState<StoreV2[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeQuery, setStoreQuery] = useState(initial?.storeName ?? "");
  const [selectedStore, setSelectedStore] = useState<StoreV2 | null>(null);

  useEffect(() => {
    if (!area) {
      setStores([]);
      return;
    }
    let alive = true;
    setStoresLoading(true);
    getStoresV2({ area_id: area.id })
      .then((res) => {
        if (alive) setStores(unwrapList<StoreV2>(res.data));
      })
      .catch(() => {
        if (alive) setStores([]);
      })
      .finally(() => alive && setStoresLoading(false));
    return () => {
      alive = false;
    };
  }, [area]);

  // Preselect the initial store once its area's stores arrive.
  useEffect(() => {
    if (initial?.storeId && stores.length) {
      const s = stores.find((x) => x.id === initial.storeId);
      if (s) setSelectedStore(s);
    }
  }, [stores, initial?.storeId]);

  const filteredAreas = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.code ?? "").toLowerCase().includes(q)
    );
  }, [areas, areaQuery]);

  const filteredStores = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => s.name.toLowerCase().includes(q));
  }, [stores, storeQuery]);

  const exactStoreMatch = useMemo(() => {
    const q = storeQuery.trim().toLowerCase();
    if (!q) return null;
    return stores.find((s) => s.name.trim().toLowerCase() === q) ?? null;
  }, [stores, storeQuery]);

  const canSave = !!area && (!!selectedStore || storeQuery.trim().length > 0);

  const save = () => {
    if (!area) return;
    const store = selectedStore ?? exactStoreMatch;
    onSave({
      areaId: area.id,
      areaName: area.name,
      areaCode: area.code,
      storeId: store ? store.id : null,
      storeName: store ? store.name : storeQuery.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 bg-white rounded-t-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-taco-divider shrink-0">
          <span className="text-[15px] font-semibold text-taco-text">{title}</span>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 flex items-center justify-center text-taco-muted rounded-lg active:bg-taco-page"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4">
          {/* Area */}
          <label className="block text-[13px] font-medium text-taco-sub mb-1.5">
            Area <span className="text-taco-error">*</span>
          </label>
          <button
            type="button"
            onClick={() => setAreaListOpen((v) => !v)}
            className={[
              "w-full min-h-[52px] rounded-xl border px-4 flex items-center gap-2.5 text-left transition-colors",
              area ? "border-taco-text bg-taco-accent-tint" : "border-taco-border bg-white",
            ].join(" ")}
          >
            <span className="text-taco-sub shrink-0">
              <PinIcon size={18} />
            </span>
            <span className="flex-1 min-w-0">
              {area ? (
                <>
                  <span className="block text-[15px] font-medium text-taco-text truncate">
                    {area.name}
                  </span>
                  {area.code && (
                    <span className="block text-[11px] text-taco-muted">{area.code}</span>
                  )}
                </>
              ) : (
                <span className="text-[15px] text-taco-muted">Pilih area…</span>
              )}
            </span>
            <span
              className={[
                "text-taco-muted shrink-0 inline-flex transition-transform",
                areaListOpen ? "-rotate-90" : "rotate-90",
              ].join(" ")}
            >
              <ChevronRightIcon size={18} />
            </span>
          </button>

          {areaListOpen && (
            <div className="mt-2 border border-taco-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-taco-divider">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-taco-muted pointer-events-none">
                    <SearchIcon size={15} />
                  </span>
                  <input
                    autoFocus
                    type="text"
                    inputMode="search"
                    placeholder="Cari nama atau kode area…"
                    value={areaQuery}
                    onChange={(e) => setAreaQuery(e.target.value)}
                    className="w-full h-[40px] border border-taco-border rounded-lg pl-8 pr-3 text-[14px] text-taco-text bg-taco-page outline-none focus:border-taco-text"
                  />
                </div>
              </div>
              <div className="max-h-[34vh] overflow-y-auto">
                {areasLoading ? (
                  <div className="px-4 py-4 text-[13px] text-taco-muted text-center">
                    Memuat area…
                  </div>
                ) : filteredAreas.length === 0 ? (
                  <div className="px-4 py-4 text-[13px] text-taco-muted text-center">
                    Tidak ada area yang cocok.
                  </div>
                ) : (
                  filteredAreas.map((a) => {
                    const sel = area?.id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setArea(a);
                          setSelectedStore(null);
                          setStoreQuery("");
                          setAreaListOpen(false);
                        }}
                        className={[
                          "w-full min-h-[48px] px-4 flex items-center gap-3 text-left border-b border-taco-divider last:border-0",
                          sel ? "bg-taco-accent-tint" : "active:bg-taco-page",
                        ].join(" ")}
                      >
                        <span className="text-taco-sub shrink-0">
                          <PinIcon size={16} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-medium text-taco-text truncate">
                            {a.name}
                          </span>
                          {a.code && (
                            <span className="block text-[11px] text-taco-muted">
                              {a.code}
                            </span>
                          )}
                        </span>
                        {sel && (
                          <span className="text-taco-success shrink-0">
                            <CheckIcon size={16} />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Store */}
          <label className="block text-[13px] font-medium text-taco-sub mb-1.5 mt-5">
            Nama Toko <span className="text-taco-error">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-taco-muted pointer-events-none">
              <SearchIcon size={16} />
            </span>
            <input
              type="text"
              inputMode="text"
              value={storeQuery}
              disabled={!area}
              onChange={(e) => {
                setStoreQuery(e.target.value);
                setSelectedStore(null);
              }}
              placeholder={area ? "Cari atau ketik nama toko" : "Pilih area dulu"}
              className="w-full h-[52px] border border-taco-border rounded-xl pl-10 pr-4 text-[16px] text-taco-text bg-white outline-none focus:border-taco-text disabled:bg-taco-page disabled:text-taco-muted"
            />
          </div>

          {area && (
            <div className="mt-2 bg-white border border-taco-border rounded-xl overflow-hidden">
              {storesLoading ? (
                <div className="px-4 py-3 text-[13px] text-taco-muted">Memuat toko…</div>
              ) : (
                <>
                  {filteredStores.slice(0, 6).map((s) => {
                    const sel = selectedStore?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedStore(s);
                          setStoreQuery(s.name);
                        }}
                        className="w-full min-h-[48px] px-4 flex items-center gap-2.5 text-left border-b border-taco-divider last:border-0 active:bg-taco-page"
                      >
                        <span className="text-taco-sub shrink-0">
                          <StoreIcon size={16} />
                        </span>
                        <span className="flex-1 text-[14px] text-taco-text truncate">
                          {s.name}
                        </span>
                        {sel && (
                          <span className="text-taco-success shrink-0">
                            <CheckIcon size={16} />
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {storeQuery.trim() && !exactStoreMatch && (
                    <button
                      type="button"
                      onClick={() => setSelectedStore(null)}
                      className="w-full min-h-[48px] px-4 flex items-center gap-2.5 text-left border-b border-taco-divider last:border-0 active:bg-taco-page"
                    >
                      <span className="text-taco-accent shrink-0">
                        <PlusIcon size={16} />
                      </span>
                      <span className="flex-1 text-[14px] text-taco-text truncate">
                        Tambah toko baru:{" "}
                        <span className="font-semibold">“{storeQuery.trim()}”</span>
                      </span>
                    </button>
                  )}

                  {!storesLoading &&
                    filteredStores.length === 0 &&
                    !storeQuery.trim() && (
                      <div className="px-4 py-3 text-[13px] text-taco-muted">
                        Belum ada toko di area ini — ketik untuk menambah.
                      </div>
                    )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-4 pb-5 pt-2 border-t border-taco-divider shrink-0">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="w-full min-h-[52px] rounded-xl bg-taco-accent text-white font-semibold text-[15px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaroV2UploadPage() {
  const router = useRouter();
  const { ready } = useTaroGuard();

  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<BatchCreateResponse | null>(null);
  /** Group labels by their commit index, for the success summary. */
  const [committedLabels, setCommittedLabels] = useState<string[]>([]);

  const [photos, setPhotos] = useState<BatchPhoto[]>([]);
  const [areas, setAreas] = useState<AreaV2[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  /** AssignSheet target: a whole group (applies to all members) or one photo. */
  const [editor, setEditor] = useState<
    | { target: { type: "group"; key: string } | { type: "photo"; id: string }; title: string; initial: { areaId?: string; storeId?: string | null; storeName?: string } | null }
    | null
  >(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileMap = useRef<Map<string, File>>(new Map());
  const thumbs = useRef<Set<string>>(new Set());
  const detectQueue = useRef<string[]>([]);
  const inFlight = useRef(0);

  // Load areas once (for needs-input resolution + group editing).
  useEffect(() => {
    let alive = true;
    setAreasLoading(true);
    getAreas()
      .then((res) => {
        if (alive) setAreas(unwrapList<AreaV2>(res.data));
      })
      .catch(() => {})
      .finally(() => alive && setAreasLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Revoke object URLs on unmount.
  useEffect(() => {
    const set = thumbs.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const detectOne = useCallback(async (id: string) => {
    const file = fileMap.current.get(id);
    if (!file) return;
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "detecting", error: null } : p))
    );
    try {
      const res = await detectV2StoreLocation(file);
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "ready", detect: res, error: null } : p
        )
      );
    } catch (err) {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, status: "error", error: extractErrorMessage(err) }
            : p
        )
      );
    }
  }, []);

  // Concurrency-limited detect pump (AC-2: each photo its own call, non-blocking).
  const pump = useCallback(() => {
    while (inFlight.current < MAX_CONCURRENT_DETECT && detectQueue.current.length) {
      const id = detectQueue.current.shift();
      if (!id) break;
      inFlight.current += 1;
      detectOne(id).finally(() => {
        inFlight.current -= 1;
        pump();
      });
    }
  }, [detectOne]);

  const addPhotos = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => ACCEPTED.includes(f.type));
      if (list.length === 0) {
        setError("Hanya gambar JPG/PNG yang didukung.");
        return;
      }
      setError(null);
      const items: BatchPhoto[] = list.map((f) => {
        const id = uid();
        const thumb = URL.createObjectURL(f);
        fileMap.current.set(id, f);
        thumbs.current.add(thumb);
        return { id, thumb, status: "detecting", detect: null, error: null, override: null };
      });
      setPhotos((prev) => [...prev, ...items]);
      items.forEach((it) => detectQueue.current.push(it.id));
      pump();
    },
    [pump]
  );

  const retryDetect = useCallback(
    (id: string) => {
      detectQueue.current.push(id);
      pump();
    },
    [pump]
  );

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const p = prev.find((x) => x.id === id);
      if (p) {
        URL.revokeObjectURL(p.thumb);
        thumbs.current.delete(p.thumb);
      }
      fileMap.current.delete(id);
      return prev.filter((x) => x.id !== id);
    });
  }, []);

  // ── Live grouping (recomputes on every photo / override change → AC-7) ──────
  const resolvedList = useMemo(
    () => photos.map((p) => ({ photo: p, res: resolvePhoto(p, areas) })),
    [photos, areas]
  );

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const { photo, res } of resolvedList) {
      if (res.kind !== "grouped") continue;
      const k = groupKey(res.assignment);
      const g = map.get(k);
      if (g) {
        g.photoIds.push(photo.id);
      } else {
        map.set(k, {
          key: k,
          areaId: res.assignment.areaId,
          areaName: res.assignment.areaName,
          areaCode: res.assignment.areaCode,
          storeId: res.assignment.storeId,
          storeName: res.assignment.storeName,
          photoIds: [photo.id],
        });
      }
    }
    return Array.from(map.values());
  }, [resolvedList]);

  const needsPhotos = useMemo(
    () =>
      resolvedList
        .filter((x) => x.res.kind === "needs")
        .map((x) => ({
          photo: x.photo,
          areaHint: (x.res as Extract<Resolved, { kind: "needs" }>).areaHint,
        })),
    [resolvedList]
  );
  const invalidPhotos = useMemo(
    () =>
      resolvedList
        .filter((x) => x.res.kind === "invalid")
        .map((x) => ({
          photo: x.photo,
          reason: (x.res as Extract<Resolved, { kind: "invalid" }>).reason,
        })),
    [resolvedList]
  );
  const detecting = useMemo(
    () => photos.filter((p) => p.status === "detecting").length,
    [photos]
  );
  const errored = useMemo(
    () => photos.filter((p) => p.status === "error").length,
    [photos]
  );

  const thumbOf = useCallback(
    (id: string) => photos.find((p) => p.id === id)?.thumb,
    [photos]
  );

  // ── AssignSheet apply (group edit / photo move / needs-input resolve) ───────
  const applyAssignment = useCallback(
    (a: Assignment) => {
      if (!editor) return;
      const t = editor.target;
      setPhotos((prev) => {
        if (t.type === "photo") {
          return prev.map((p) => (p.id === t.id ? { ...p, override: a } : p));
        }
        // Group edit: re-assign every photo currently in this group.
        const memberIds = new Set(
          groups.find((g) => g.key === t.key)?.photoIds ?? []
        );
        return prev.map((p) => (memberIds.has(p.id) ? { ...p, override: a } : p));
      });
      setEditor(null);
    },
    [editor, groups]
  );

  const openGroupEditor = (g: Group) =>
    setEditor({
      target: { type: "group", key: g.key },
      title: "Ubah toko & area",
      initial: { areaId: g.areaId, storeId: g.storeId, storeName: g.storeName },
    });

  const openPhotoEditor = (id: string, hint: AreaV2 | null, title: string) =>
    setEditor({
      target: { type: "photo", id },
      title,
      initial: hint ? { areaId: hint.id } : null,
    });

  const openImagePreview = async (id: string) => {
    const local = thumbOf(id);
    if (local) {
      setPreview(local);
      return;
    }
    const url = await getV2ImageUrl(id);
    if (url) setPreview(url);
  };

  // ── Commit (AC-8): one invoice per group via the batch endpoint ────────────
  const commit = async () => {
    const payload: BatchInvoiceGroupInput[] = [];
    const labels: string[] = [];
    for (const g of groups) {
      const stagedIds = g.photoIds
        .map((id) => photos.find((p) => p.id === id)?.detect?.staged_image_id)
        .filter((x): x is string => !!x);
      if (stagedIds.length === 0) continue;
      payload.push({
        area_id: g.areaId,
        ...(g.storeId ? { store_id: g.storeId } : { store_name: g.storeName }),
        staged_image_ids: stagedIds,
      });
      labels.push(`${g.storeName} · ${g.areaName}`);
    }
    if (payload.length === 0) {
      setError("Belum ada grup yang siap dibuat.");
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const resp = await batchCreateV2Invoices(payload, true);
      setResult(resp);
      setCommittedLabels(labels);
      setPhase("success");
    } catch (err) {
      setError(`Gagal membuat invoice: ${extractErrorMessage(err)}`);
    } finally {
      setCommitting(false);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-taco-page flex items-center justify-center text-[13px] text-taco-muted">
        Memuat…
      </div>
    );
  }

  const canReview = photos.length > 0 && detecting === 0;

  return (
    <div className="min-h-screen bg-taco-page flex flex-col">
      <div className="phone-shell flex flex-col min-h-screen">
        <TopBar
          title="Upload Invoice"
          right={
            phase === "review" ? (
              <button
                type="button"
                onClick={() => setPhase("pick")}
                className="text-[13px] font-medium text-taco-sub px-2 py-1"
              >
                Kembali
              </button>
            ) : phase === "pick" ? (
              <button
                type="button"
                onClick={() => router.push("/taro-app/v2/home")}
                className="text-[13px] font-medium text-taco-sub px-2 py-1"
              >
                Batal
              </button>
            ) : undefined
          }
        />

        {error && (
          <div className="mx-4 mt-3 text-[12px] text-taco-error bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Phase: Pick (multi) ─────────────────────────────────────────── */}
        {phase === "pick" && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="text-[15px] font-semibold text-taco-text">
              Foto semua invoice
            </div>
            <div className="text-[13px] text-taco-sub mt-1">
              Ambil atau pilih beberapa foto sekaligus. Kami baca toko &amp; area
              tiap foto, lalu kelompokkan otomatis.
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="min-h-[88px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-1.5 text-taco-sub active:bg-taco-page"
              >
                <CameraIcon size={26} />
                <span className="text-[13px] font-medium">Ambil Foto</span>
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="min-h-[88px] rounded-xl border-2 border-dashed border-taco-border bg-white flex flex-col items-center justify-center gap-1.5 text-taco-sub active:bg-taco-page"
              >
                <PlusIcon size={26} />
                <span className="text-[13px] font-medium">Dari Galeri</span>
              </button>
            </div>

            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={galleryRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addPhotos(e.target.files);
                e.target.value = "";
              }}
            />

            {photos.length > 0 && (
              <>
                <div className="flex items-center justify-between mt-5 mb-2">
                  <div className="text-[13px] font-medium text-taco-sub">
                    {photos.length} foto
                  </div>
                  <div className="text-[11px] text-taco-muted">
                    {detecting > 0 ? `${detecting} dibaca…` : "Semua terbaca"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p) => {
                    const res = resolvePhoto(p, areas);
                    return (
                      <div
                        key={p.id}
                        className="relative aspect-square rounded-xl overflow-hidden bg-taco-page border border-taco-border"
                      >
                        <button
                          type="button"
                          onClick={() => openImagePreview(p.id)}
                          className="absolute inset-0"
                          aria-label="Lihat foto"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.thumb}
                            alt="invoice"
                            className="w-full h-full object-cover"
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => removePhoto(p.id)}
                          aria-label="Hapus foto"
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center active:bg-black/70"
                        >
                          <CloseIcon size={13} />
                        </button>

                        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-black/55 text-white text-[10px] leading-tight">
                          {p.status === "detecting" && (
                            <span className="flex items-center gap-1">
                              <span className="animate-spin inline-flex">
                                <SpinnerIcon size={11} />
                              </span>
                              Membaca…
                            </span>
                          )}
                          {p.status === "error" && (
                            <button
                              type="button"
                              onClick={() => retryDetect(p.id)}
                              className="flex items-center gap-1 text-amber-200"
                            >
                              <RefreshIcon size={11} /> Coba lagi
                            </button>
                          )}
                          {p.status === "ready" && res.kind === "invalid" && (
                            <span className="flex items-center gap-1 text-red-200">
                              <XCircleIcon size={11} /> Tidak valid
                            </span>
                          )}
                          {p.status === "ready" && res.kind === "needs" && (
                            <span className="flex items-center gap-1 text-amber-200">
                              <AlertTriangleIcon size={11} /> Perlu input
                            </span>
                          )}
                          {p.status === "ready" && res.kind === "grouped" && (
                            <span className="block truncate">
                              {res.assignment.storeName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => setPhase("review")}
                disabled={!canReview}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {detecting > 0 ? (
                  <>
                    <span className="animate-spin inline-flex">
                      <SpinnerIcon size={18} />
                    </span>
                    Membaca {detecting} foto…
                  </>
                ) : (
                  `Tinjau & Kelompokkan${photos.length ? ` (${photos.length})` : ""}`
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Review / regroup ─────────────────────────────────────── */}
        {phase === "review" && (
          <div className="px-4 pt-4 flex-1 flex flex-col pb-6">
            <div className="text-[13px] text-taco-sub mb-3">
              {groups.length} invoice akan dibuat
              {needsPhotos.length > 0 ? ` · ${needsPhotos.length} perlu input` : ""}
              {invalidPhotos.length > 0 ? ` · ${invalidPhotos.length} tidak valid` : ""}
            </div>

            {errored > 0 && (
              <div className="mb-3 text-[12px] text-taco-sub bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {errored} foto gagal dibaca. Kembali untuk coba lagi atau hapus.
              </div>
            )}

            {/* Groups → one future invoice each */}
            {groups.map((g) => (
              <div
                key={g.key}
                className="bg-white border border-taco-border rounded-2xl p-3 mb-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-taco-text truncate flex items-center gap-1.5">
                      <span className="text-taco-sub shrink-0">
                        <StoreIcon size={15} />
                      </span>
                      {g.storeName}
                      {!g.storeId && (
                        <span className="text-[10px] font-medium text-taco-accent bg-taco-accent-tint rounded px-1 py-0.5 shrink-0">
                          baru
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-taco-muted mt-0.5 truncate">
                      {g.areaName}
                      {g.areaCode ? ` · ${g.areaCode}` : ""} · {g.photoIds.length} foto
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openGroupEditor(g)}
                    className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-taco-accent px-2 py-1 rounded-lg active:bg-taco-accent-tint"
                  >
                    <PencilIcon size={14} /> Ubah
                  </button>
                </div>

                <div className="flex gap-2 mt-2.5 flex-wrap">
                  {g.photoIds.map((id) => (
                    <div key={id} className="relative">
                      <button
                        type="button"
                        onClick={() => openImagePreview(id)}
                        className="w-14 h-14 rounded-lg overflow-hidden bg-taco-page border border-taco-border block active:opacity-80"
                        aria-label="Lihat foto"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbOf(id) ?? ""}
                          alt="invoice"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          openPhotoEditor(id, null, "Pindahkan / ubah toko foto")
                        }
                        aria-label="Pindahkan foto"
                        className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border border-taco-border text-taco-sub flex items-center justify-center active:bg-taco-page"
                      >
                        <RefreshIcon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Needs-input pile (AC-5) */}
            {needsPhotos.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-3">
                <div className="text-[13px] font-semibold text-taco-text flex items-center gap-1.5">
                  <span className="text-taco-warning">
                    <AlertTriangleIcon size={15} />
                  </span>
                  Perlu input ({needsPhotos.length})
                </div>
                <div className="text-[12px] text-taco-sub mt-0.5">
                  Toko tidak terbaca. Tetapkan toko &amp; area agar ikut dibuat.
                </div>
                <div className="flex flex-col gap-2 mt-2.5">
                  {needsPhotos.map(({ photo, areaHint }) => (
                    <div
                      key={photo.id}
                      className="bg-white border border-taco-border rounded-xl p-2 flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => openImagePreview(photo.id)}
                        className="w-14 h-14 rounded-lg overflow-hidden bg-taco-page border border-taco-border shrink-0 active:opacity-80"
                        aria-label="Lihat foto"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.thumb}
                          alt="invoice"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-taco-sub truncate">
                          {photo.detect?.detected.store_name_raw
                            ? `Terbaca: ${photo.detect.detected.store_name_raw}`
                            : "Toko tidak terbaca dari foto"}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            openPhotoEditor(
                              photo.id,
                              areaHint,
                              "Tetapkan toko & area"
                            )
                          }
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-taco-accent"
                        >
                          <PlusIcon size={13} /> Tetapkan toko &amp; area
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label="Hapus foto"
                        className="shrink-0 w-9 h-9 rounded-lg border border-taco-border text-taco-sub flex items-center justify-center active:bg-taco-page"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invalid pile (AC-6) */}
            {invalidPhotos.length > 0 && (
              <div className="bg-white border border-red-200 rounded-2xl p-3 mb-3">
                <div className="text-[13px] font-semibold text-taco-text flex items-center gap-1.5">
                  <span className="text-taco-error">
                    <XCircleIcon size={15} />
                  </span>
                  Tidak valid ({invalidPhotos.length})
                </div>
                <div className="text-[12px] text-taco-sub mt-0.5">
                  Dikeluarkan dari batch. Hapus, atau kembali untuk foto ulang.
                </div>
                <div className="flex flex-col gap-2 mt-2.5">
                  {invalidPhotos.map(({ photo, reason }) => (
                    <div
                      key={photo.id}
                      className="border border-red-200 rounded-xl p-2 flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => openImagePreview(photo.id)}
                        className="w-14 h-14 rounded-lg overflow-hidden bg-taco-page border border-red-200 shrink-0 active:opacity-80"
                        aria-label="Lihat foto"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.thumb}
                          alt="invoice"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-taco-error font-medium">
                          {reason}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePhoto(photo.id)}
                        aria-label="Hapus foto"
                        className="shrink-0 w-9 h-9 rounded-lg border border-red-200 text-taco-error flex items-center justify-center active:bg-red-50"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groups.length === 0 &&
              needsPhotos.length === 0 &&
              invalidPhotos.length === 0 && (
                <div className="text-[13px] text-taco-muted text-center py-8">
                  Belum ada foto. Kembali untuk menambah.
                </div>
              )}

            <div className="mt-auto pt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={commit}
                disabled={groups.length === 0 || committing}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
              >
                {committing ? (
                  <>
                    <span className="animate-spin inline-flex">
                      <SpinnerIcon size={18} />
                    </span>
                    Membuat…
                  </>
                ) : (
                  `Buat ${groups.length} Invoice`
                )}
              </button>
              <button
                type="button"
                onClick={() => setPhase("pick")}
                disabled={committing}
                className="w-full min-h-[44px] rounded-xl text-[14px] font-medium text-taco-sub bg-white border border-taco-border disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <PlusIcon size={15} /> Tambah Foto
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Success ──────────────────────────────────────────────── */}
        {phase === "success" && result && (
          <div className="px-4 pt-6 flex-1 flex flex-col pb-6">
            <div className="bg-white border border-taco-border rounded-2xl p-5 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 text-taco-success flex items-center justify-center">
                <CheckIcon size={30} />
              </div>
              <div className="text-[16px] font-semibold text-taco-text mt-3">
                {result.created_count} invoice dibuat
              </div>
              <div className="text-[13px] text-taco-sub mt-1">
                Sedang diproses (OCR). Lihat hasilnya di Riwayat.
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              {result.results.map((r) => (
                <div
                  key={r.index}
                  className={[
                    "rounded-xl border p-3 flex items-center gap-2.5",
                    r.ok ? "bg-white border-taco-border" : "bg-red-50 border-red-200",
                  ].join(" ")}
                >
                  <span className={r.ok ? "text-taco-success" : "text-taco-error"}>
                    {r.ok ? <CheckIcon size={18} /> : <XCircleIcon size={18} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-taco-text truncate">
                      {committedLabels[r.index] ?? `Grup ${r.index + 1}`}
                    </div>
                    {!r.ok && r.error && (
                      <div className="text-[12px] text-taco-error mt-0.5">
                        {r.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => router.push("/taro-app/v2/history")}
                className="w-full min-h-[56px] rounded-xl bg-taco-accent text-white font-semibold text-[16px] active:bg-taco-accent-dark transition-colors"
              >
                Lihat Riwayat
              </button>
            </div>
          </div>
        )}
      </div>

      {editor && (
        <AssignSheet
          areas={areas}
          areasLoading={areasLoading}
          title={editor.title}
          initial={editor.initial}
          onCancel={() => setEditor(null)}
          onSave={applyAssignment}
        />
      )}

      {preview && (
        <ImageLightboxV2 src={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
