/**
 * TACO v2 — store + location (area) fuzzy matcher.
 *
 * Pure, dependency-free string matching used by the photo-first upload flow:
 * OCR reads a store name + a location/city off the invoice, and we match those
 * against the StoreV2 / Region(area) master data to drive the auto / best-guess /
 * manual confidence branch. No API calls — cheap, deterministic, unit-testable.
 */

/** Minimal shape needed from a Region(area) row — keeps this file entity-free. */
export interface AreaCandidate {
  id: string;
  name: string;
  code: string;
  display_path: string;
}

/** Minimal shape needed from a StoreV2 row. */
export interface StoreCandidate {
  id: string;
  name: string;
  area_id: string;
}

export interface MatchHit<T> {
  item: T;
  score: number;
}

/**
 * Normalize free text for comparison: lower-case, strip diacritics, replace any
 * non-alphanumeric run with a single space, trim. "PT. Sinar-Bangunan (JKT)" →
 * "pt sinar bangunan jkt".
 */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Indonesian store/legal-form noise tokens that shouldn't drive a match. */
const STOPWORDS = new Set([
  'pt',
  'cv',
  'ud',
  'toko',
  'tk',
  'tb',
  'nota',
  'faktur',
  'kwitansi',
  'jl',
  'jalan',
  'no',
  'asm',
  'bu1',
  'bu',
  // Generic building-materials words present in most shop names — they shouldn't
  // by themselves drive a match (every "Toko Bangunan ..." shares them).
  'bangunan',
  'material',
  'bahan',
  'bdg',
]);

function tokens(norm: string): string[] {
  return norm.split(' ').filter((t) => t.length > 0);
}

function contentTokens(norm: string): string[] {
  return tokens(norm).filter((t) => !STOPWORDS.has(t));
}

/** Character-bigram set for the Sørensen–Dice coefficient. */
function bigrams(s: string): Map<string, number> {
  const compact = s.replace(/ /g, '');
  const m = new Map<string, number>();
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.slice(i, i + 2);
    m.set(bg, (m.get(bg) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice coefficient on character bigrams (0..1). */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const [bg, count] of ba) {
    const other = bb.get(bg);
    if (other) intersection += Math.min(count, other);
  }
  const total =
    [...ba.values()].reduce((x, y) => x + y, 0) +
    [...bb.values()].reduce((x, y) => x + y, 0);
  return (2 * intersection) / total;
}

/** Weighted Jaccard over content tokens (stopwords removed). */
function tokenOverlap(aNorm: string, bNorm: string): number {
  const a = new Set(contentTokens(aNorm));
  const b = new Set(contentTokens(bNorm));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = new Set([...a, ...b]).size;
  return inter / union;
}

/**
 * Similarity of two free-text strings, 0..1. Blends a character-bigram Dice score
 * with a content-token overlap, then boosts when one string's content tokens are
 * fully contained in the other (handles "Cirebon" ⊂ "ASM Cirebon" and partial
 * shop names). Exact normalized equality is always 1.0.
 */
export function similarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // Dice on the content-token-stripped form so a shared generic word ("bangunan")
  // can't inflate the score; fall back to the full form for all-generic names.
  const caStr = contentTokens(na).join(' ');
  const cbStr = contentTokens(nb).join(' ');
  const dice = diceCoefficient(caStr || na, cbStr || nb);
  const overlap = tokenOverlap(na, nb);

  // Containment boost: every content token of the shorter side appears in the longer.
  const ca = contentTokens(na);
  const cb = contentTokens(nb);
  let containment = 0;
  if (ca.length > 0 && cb.length > 0) {
    const [shortT, longSet] =
      ca.length <= cb.length ? [ca, new Set(cb)] : [cb, new Set(ca)];
    const allIn = shortT.every((t) => longSet.has(t));
    if (allIn)
      containment =
        0.6 + 0.25 * (shortT.length / Math.max(ca.length, cb.length));
  }

  return Math.min(1, Math.max(dice, overlap, containment));
}

/**
 * Best area match for an OCR'd location string. Tries the area's name, code, and
 * display_path and keeps the strongest. Returns null when nothing scores > 0.
 */
export function matchArea(
  locationRaw: string | null | undefined,
  areas: AreaCandidate[],
): MatchHit<AreaCandidate> | null {
  const loc = (locationRaw ?? '').trim();
  if (!loc) return null;
  let best: MatchHit<AreaCandidate> | null = null;
  for (const area of areas) {
    const score = Math.max(
      similarity(loc, area.name),
      similarity(loc, area.code),
      similarity(loc, area.display_path),
    );
    if (score > 0 && (!best || score > best.score)) {
      best = { item: area, score };
    }
  }
  return best;
}

/**
 * Best store match for an OCR'd store name. When `areaIdHint` is supplied, stores
 * in that area get a small tie-breaking nudge (the rep's location is corroborating
 * evidence) but cross-area matches are still allowed.
 */
export function matchStore(
  storeRaw: string | null | undefined,
  stores: StoreCandidate[],
  areaIdHint?: string | null,
): MatchHit<StoreCandidate> | null {
  const name = (storeRaw ?? '').trim();
  if (!name) return null;
  let best: MatchHit<StoreCandidate> | null = null;
  for (const store of stores) {
    let score = similarity(name, store.name);
    if (areaIdHint && store.area_id === areaIdHint && score > 0) {
      score = Math.min(1, score + 0.05);
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { item: store, score };
    }
  }
  return best;
}

export type DetectOutcome = 'auto' | 'best_guess' | 'manual' | 'invalid';

/**
 * Map store/area match scores to the confidence branch (Yumi's default mapping):
 *   - auto       store matched clearly (≥0.85) — area is derived from the store.
 *   - best_guess store OR area in 0.55–0.85 (fuzzy/partial) — preselect, editable.
 *   - manual     nothing ≥0.55 / no plausible master match — rep inputs manually.
 * `invalid` is decided upstream by the image-validation gate, not here.
 */
export function bandForMatch(
  storeScore: number,
  areaScore: number,
): Exclude<DetectOutcome, 'invalid'> {
  if (storeScore >= 0.85) return 'auto';
  if (storeScore >= 0.55 || areaScore >= 0.55) return 'best_guess';
  return 'manual';
}
