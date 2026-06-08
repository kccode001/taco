// 8 product lines per CATEGORIES-LOCKED.md (Plywood dropped, TI → TIero).
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

export const PROJECT_TYPES = [
  "Perumahan",
  "Apartemen",
  "Komersial",
  "Renovasi",
  "Lainnya",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];
