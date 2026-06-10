/** TACO v2 — invoice / image / line-item API client (Pair A FE, Tile).
 *  Sibling to `lib/v2/api.ts` (Mosaic's management endpoints) — kept separate so
 *  the two FE engineers don't contend on one file. Reuses the v1 axios instance
 *  (`api`) for its auth interceptor + `/api` baseURL, and Mosaic's list/one
 *  unwrap helpers. New file per the v1 freeze; do NOT touch v1 `lib/api.ts`.
 *
 *  Field shapes mirror Grout's canonical v2 entities
 *  (`backend/src/database/entities/v2/*`). Responses are normalized defensively
 *  (`T` | `{data:T}` | `{images:[]}`) since the BE DTOs may still be settling. */

import { api } from "@/lib/api";
import { unwrapList, unwrapOne } from "./api";
import type { AreaV2, StoreV2 } from "./types";

// ── Enums (string unions mirroring Grout's TS enums) ──────────────────────
export type InvoiceV2Status =
  | "validating"
  | "ocr_processing"
  | "needs_review"
  | "done"
  | "failed";

export type ImageValidationStatus = "pending" | "valid" | "invalid";

/** 9-bucket classification taxonomy (FROZEN contract, BUILD-PLAN-v2). */
export type LineClassificationV2 =
  | "taco_very_high"
  | "taco_high"
  | "taco_low_verify"
  | "taco_unreadable_guess"
  | "not_taco_very_high"
  | "not_taco_high"
  | "not_taco_low_verify"
  | "not_taco_unreadable_guess"
  | "unknown_needs_human";

export type ConfidenceBandV2 = "very_high" | "high" | "low" | "unreadable";

// ── Entity-shaped DTOs ─────────────────────────────────────────────────────
export interface InvoiceImageV2 {
  id: string;
  invoice_id?: string;
  file_path?: string | null;
  file_name?: string | null;
  validation_status: ImageValidationStatus;
  /** Indonesian reason when validation_status === "invalid". */
  invalid_reason?: string | null;
  /** Signed/relative display URL when the BE serializes one (admin detail). */
  url?: string | null;
  created_at?: string;
}

export interface MatchedSkuV2 {
  id: string;
  code?: string | null;
  name?: string | null;
}

export interface InvoiceLineItemV2 {
  id: string;
  invoice_id?: string;
  line_no?: number;
  raw_text: string;
  classification: LineClassificationV2;
  confidence_band?: ConfidenceBandV2 | null;
  confidence_score?: string | number;
  matched_sku_id?: string | null;
  matched_sku?: MatchedSkuV2 | null;
  brand_id?: string | null;
  brand_name?: string | null;
  is_competitor?: boolean;
  /** Captured when the system's TACO/not-TACO call was wrong (feeds rec engine). */
  mismatch_reason?: string | null;
  quantity?: string | number;
  unit?: string | null;
  unit_price?: string | number;
  total_price?: string | number;
}

export interface InvoiceV2 {
  id: string;
  area_id: string;
  store_id: string;
  area?: AreaV2 | null;
  store?: StoreV2 | null;
  /** Denormalized labels when the BE joins them in. */
  area_name?: string | null;
  store_name?: string | null;
  uploaded_by?: string | null;
  uploaded_by_name?: string | null;
  status: InvoiceV2Status;
  created_at?: string;
  images?: InvoiceImageV2[];
  line_items?: InvoiceLineItemV2[];
}

// ── Upload-flow helpers (PWA) ──────────────────────────────────────────────

/** Step 1: create the invoice shell for an Area + Store. */
export async function createV2Invoice(
  areaId: string,
  storeId: string
): Promise<InvoiceV2> {
  const res = await api.post("/v2/invoices", {
    area_id: areaId,
    store_id: storeId,
  });
  const inv = unwrapOne<InvoiceV2>(res.data);
  if (!inv) throw new Error("Server tidak mengembalikan invoice.");
  return inv;
}

function readImages(body: unknown): InvoiceImageV2[] {
  const imgs = (body as { images?: InvoiceImageV2[] })?.images;
  return Array.isArray(imgs) ? imgs : unwrapList<InvoiceImageV2>(body);
}

/** Step 2: attach images (camera + gallery, multi). Returns the image rows
 *  (validation_status starts `pending`). */
export async function uploadV2Images(
  invoiceId: string,
  files: File[]
): Promise<InvoiceImageV2[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await api.post(`/v2/invoices/${invoiceId}/images`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 180_000,
  });
  return readImages(res.data);
}

/** Step 3: run validation. The BE re-checks ONLY `pending` images — already
 *  `valid` ones are untouched. Returns the full image set with updated states. */
export async function validateV2Images(
  invoiceId: string
): Promise<InvoiceImageV2[]> {
  const res = await api.post(
    `/v2/invoices/${invoiceId}/validate`,
    {},
    { timeout: 180_000 }
  );
  return readImages(res.data);
}

/** Delete a single (typically invalid) image inline during upload. */
export const deleteV2Image = (imageId: string) =>
  api.delete(`/v2/invoice-images/${imageId}`);

/** Kick OCR + 9-bucket classification + SKU mapping once every image is valid. */
export async function processV2Invoice(invoiceId: string): Promise<InvoiceV2> {
  const res = await api.post(`/v2/invoices/${invoiceId}/process`, {});
  const inv = unwrapOne<InvoiceV2>(res.data);
  if (!inv) throw new Error("Server tidak mengembalikan invoice.");
  return inv;
}

// ── Admin detail / resolve ─────────────────────────────────────────────────

export async function getV2Invoice(id: string): Promise<InvoiceV2 | null> {
  const res = await api.get(`/v2/invoices/${id}`);
  return unwrapOne<InvoiceV2>(res.data);
}

/** Fetch a short-lived signed URL for an invoice image. The BE serves images
 *  behind JWT (`GET /api/v2/invoice-images/:id/image`); a plain <img src> can't
 *  send the auth header, so we mint a `?token=` URL the JwtStrategy accepts.
 *  Returns null on failure so the caller can fall back to a placeholder. */
export async function getV2ImageUrl(imageId: string): Promise<string | null> {
  try {
    const res = await api.get<{ url?: string } | { data?: { url?: string } }>(
      `/v2/invoice-images/${imageId}/image-url`
    );
    const body = res.data as { url?: string; data?: { url?: string } };
    return body?.url ?? body?.data?.url ?? null;
  } catch {
    return null;
  }
}

/** Admin resolve contract (`PATCH /api/v2/invoice-line-items/:id`):
 *   - { matched_sku_id, reason } → map / re-map a TACO SKU
 *   - { brand_id, is_competitor:true } → mark a competitor brand
 *   - { is_competitor:true } w/ no brand → competitor, brand unknown
 *   - { mismatch_reason } → capture why the system's TACO/not-TACO call was wrong
 *  Response echoes the updated line + the recomputed `invoice_status`. */
export interface PatchLineItemV2Body {
  matched_sku_id?: string | null;
  brand_id?: string | null;
  is_competitor?: boolean;
  /** TACO↔not-TACO correction note for the recommendation engine. */
  mismatch_reason?: string;
  /** SKU-correction audit note required by the BE when matched_sku_id changes. */
  reason?: string;
}

export interface PatchLineItemV2Response extends InvoiceLineItemV2 {
  invoice_status?: InvoiceV2Status;
  status?: InvoiceV2Status;
  invoice?: { status?: InvoiceV2Status };
}

export async function patchV2LineItem(
  id: string,
  body: PatchLineItemV2Body
): Promise<PatchLineItemV2Response> {
  const res = await api.patch<PatchLineItemV2Response>(
    `/v2/invoice-line-items/${id}`,
    body
  );
  const line = unwrapOne<PatchLineItemV2Response>(res.data);
  if (!line) throw new Error("Server tidak mengembalikan baris invoice.");
  return line;
}

/** Read the recomputed invoice status out of a resolve response, whichever
 *  shape the BE used (top-level `invoice_status`/`status` or nested). */
export function readInvoiceStatus(
  r: PatchLineItemV2Response
): InvoiceV2Status | undefined {
  return r.invoice_status ?? r.status ?? r.invoice?.status;
}
