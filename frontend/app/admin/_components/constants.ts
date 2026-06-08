/** Product line enum locked in CATEGORIES-LOCKED.md.
 *  8 values that cover 965/965 catalog SKUs.
 *  Use these everywhere a product_line filter or select is needed. */
export const PRODUCT_LINES = [
  { slug: "taco_hpl", label: "TACO HPL" },
  { slug: "tiero", label: "TIero" },
  { slug: "eco_hpl", label: "ECO HPL" },
  { slug: "taco_sheet", label: "TACO Sheet" },
  { slug: "taco_edging", label: "TACO Edging" },
  { slug: "taco_hardware", label: "TACO Hardware" },
  { slug: "vinyl", label: "Vinyl" },
  { slug: "fideco", label: "FIDECO" },
] as const;

export type ProductLineSlug = (typeof PRODUCT_LINES)[number]["slug"];

/** Raw xlsx catalog categories (4 values). Coarser secondary filter on the
 *  TACO SKU table. */
export const CATALOG_CATEGORIES = [
  "Laminates",
  "Flooring",
  "Hardware",
  "FIDECO",
] as const;

/** 10 seeded competitor brands. Brand Kompetitor CRUD shows these on first load
 *  when the API is unavailable; otherwise the API replaces the list. */
export const SEED_COMPETITOR_BRANDS = [
  { name: "Krono", country: "Germany" },
  { name: "Kronospan", country: "Austria" },
  { name: "Pergo", country: "Belgium" },
  { name: "Egger", country: "Austria" },
  { name: "Unilin", country: "Belgium" },
  { name: "Armstrong", country: "USA" },
  { name: "Teka", country: "Germany" },
  { name: "Greenply", country: "India" },
  { name: "Meranti", country: "Indonesia" },
  { name: "Lainnya", country: "—" },
];

/** 9 seeded Wilayah. Wilayah CRUD shows these on first load when the API is
 *  unavailable. Matches the rep edit modal hint "Sumber: katalog Wilayah". */
export const SEED_WILAYAH = [
  { name: "Tangerang Selatan", code: "TGR-SEL" },
  { name: "Bekasi", code: "BKS" },
  { name: "Jakarta Barat", code: "JKT-BRT" },
  { name: "Jakarta Selatan", code: "JKT-SEL" },
  { name: "Depok", code: "DPK" },
  { name: "Bandung & Jawa Barat", code: "BDG" },
  { name: "Surabaya & Jawa Timur", code: "SBY" },
  { name: "Sumatera (Medan)", code: "MDN" },
  { name: "Bali & NTB", code: "BAL" },
];

export const STORE_TYPES = [
  { value: "toko", label: "Toko" },
  { value: "distributor", label: "Distributor" },
  { value: "workshop", label: "Workshop" },
] as const;

export type StoreTypeSlug = (typeof STORE_TYPES)[number]["value"];

export const STORE_TYPE_TONE: Record<StoreTypeSlug, "info" | "neutral" | "ok"> = {
  toko: "info",
  distributor: "neutral",
  workshop: "ok",
};

export const POSM_OWNERS = [
  { value: "taco", label: "TACO" },
  { value: "kompetitor", label: "Kompetitor" },
] as const;

export const BURNING_Q_SCOPE = [
  { value: "company", label: "Seluruh perusahaan" },
  { value: "region", label: "Per wilayah" },
  { value: "store", label: "Per toko" },
];
