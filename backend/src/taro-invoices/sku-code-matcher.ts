/**
 * Exact-code matching layer for Taro OCR.
 *
 * Background — KC observed real invoices where Claude vision picked obviously
 * wrong SKU codes (e.g. "HPL TH. 053 AA" → TH 043 AA "Vintage Wine") even
 * though the catalog has an exact alias "HPL TH 053 AA" for TH 053 AA. The
 * mis-mapping happens because:
 *   - the RAG candidate selection uses a coarse generic probe, so the correct
 *     SKU isn't always in the top-40 candidates fed to Claude;
 *   - when only similar-but-wrong codes (TH 043, TH 003, …) reach the prompt,
 *     Claude picks the closest looking one rather than returning null.
 *
 * Fix — before invoking the semantic pipeline, scan the OCR raw_text for a
 * TACO SKU code pattern and try a deterministic match against catalog code +
 * aliases. Confidence 0.95 on hit. RAG/Claude only runs when the exact match
 * fails.
 *
 * The matcher is intentionally narrow:
 *   1. Strip common noise (leading category prefix "HPL", trailing units).
 *   2. Drop dots inside codes: "TH. 053 AA" → "TH 053 AA".
 *   3. Generate token windows ([2-4] adjacent uppercase code-shaped tokens).
 *   4. Compare each window against the catalog (normalized: uppercase, no
 *      spaces, no dashes). A window matches a SKU if its normalized form
 *      equals the SKU's normalized code OR any normalized alias.
 *
 * Returns the matched SKU + confidence, or null when nothing matched.
 */

export interface SkuCodeRow {
  id: string;
  code: string;
  /** product_name_aliases — usually includes the printed/raw OCR variants. */
  product_name_aliases: string[];
}

export interface ExactCodeMatch {
  sku_id: string;
  matched_code: string;
  matched_via: 'code' | 'alias';
  /** The original window from raw_text that produced the match. */
  raw_window: string;
  confidence: number;
}

/** Normalize a code or alias for equality comparison. */
export function normalizeSkuCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[\.,]/g, '') // drop dots/commas inside codes
    .replace(/-/g, '')
    .replace(/\s+/g, '');
}

/**
 * Tokenize raw OCR text into uppercase code-shaped tokens. Keeps alphanumeric
 * tokens and treats common punctuation as separators (but preserves the slash
 * for codes like "ET 06/A"). Discards pure noise like "Rp", price digits with
 * thousand separators, and very long tokens (descriptions).
 */
function tokenizeForCodeMatch(raw: string): string[] {
  const cleaned = raw
    .replace(/[\(\)\[\]\{\}:,;!"']/g, ' ')
    .replace(/\.(?=\s|$)/g, ' ') // sentence-final dot
    .replace(/\.(?=\d{3}\b)/g, '') // "Rp 1.600.000" → strip thousands dot
    .toUpperCase();
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => {
      // Drop pure number tokens that look price-like (≥5 digits — Indonesian
      // prices are ≥10.000 once the thousands dot is stripped). Keep 1-4 digit
      // numeric tokens because SKU codes legitimately include them — e.g.
      // "TI X0141 VA" → tokens "TI X0141 VA" or aliases "TIX 0141". Throwing
      // away "0141" was a real bug: it left "HPL TIX" as the only window which
      // never matched the catalog alias "TIX0141VA".
      if (/^\d{5,}$/.test(t)) return false;
      if (t.length > 12) return false;
      // Drop obvious Indonesian/English filler.
      if (
        ['DAN', 'ATAU', 'YANG', 'UNTUK', 'DENGAN', 'RP', 'PCS', 'PCS.', 'LBR', 'SET', 'KG', 'BTL'].includes(t)
      ) return false;
      return true;
    });
}

/**
 * Generate sliding windows of 2-4 adjacent tokens, joined by single spaces.
 * Window of 1 is intentionally skipped — a SKU code is almost never a single
 * token (e.g. "TH 053 AA" needs at least 2 tokens; even "FWP 4001 PA" is 3).
 */
function windows(tokens: string[]): string[] {
  const out: string[] = [];
  for (let size = 4; size >= 2; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      out.push(tokens.slice(i, i + size).join(' '));
    }
  }
  // De-dupe while preserving order.
  return Array.from(new Set(out));
}

/**
 * Build a lookup map from normalized code/alias to its source SKU. Aliases
 * win ties only when they're longer than the existing entry — code matches
 * always take precedence on collision.
 */
export function buildCodeIndex(skus: SkuCodeRow[]): Map<string, { sku_id: string; matched_code: string; via: 'code' | 'alias' }> {
  const idx = new Map<string, { sku_id: string; matched_code: string; via: 'code' | 'alias' }>();
  for (const s of skus) {
    const codeKey = normalizeSkuCode(s.code);
    if (codeKey.length >= 4) {
      idx.set(codeKey, { sku_id: s.id, matched_code: s.code, via: 'code' });
    }
  }
  // Aliases second — never overwrite a code hit.
  for (const s of skus) {
    for (const alias of s.product_name_aliases ?? []) {
      if (typeof alias !== 'string') continue;
      const k = normalizeSkuCode(alias);
      if (k.length < 4) continue; // skip pure-numeric short aliases like "053"
      if (idx.has(k)) continue;
      idx.set(k, { sku_id: s.id, matched_code: s.code, via: 'alias' });
    }
  }
  return idx;
}

/**
 * Try to match a raw OCR line against the catalog by exact code/alias lookup.
 *
 * Strategy:
 *   1. Tokenize the raw text into uppercase code-shaped tokens.
 *   2. Try the longest contiguous windows first (4 → 2 tokens) so that
 *      "TH 053 AA" wins over a shorter substring match like "TH 053".
 *   3. Each window's normalized form is checked against the prebuilt index.
 *   4. Return the first hit. Confidence is 0.95 for exact code, 0.93 for
 *      alias — both above the 0.85 needs_review threshold.
 *
 * Returns null when no window matches.
 */
export function findExactSkuCode(
  rawText: string,
  index: Map<string, { sku_id: string; matched_code: string; via: 'code' | 'alias' }>,
): ExactCodeMatch | null {
  if (!rawText) return null;
  const tokens = tokenizeForCodeMatch(rawText);
  if (tokens.length < 2) return null;
  for (const win of windows(tokens)) {
    const key = normalizeSkuCode(win);
    if (key.length < 4) continue;
    const hit = index.get(key);
    if (hit) {
      return {
        sku_id: hit.sku_id,
        matched_code: hit.matched_code,
        matched_via: hit.via,
        raw_window: win,
        confidence: hit.via === 'code' ? 0.95 : 0.93,
      };
    }
  }
  return null;
}

/**
 * Convenience helper for one-off raw_text → SKU lookups (tests, smoke probes).
 * Re-builds the index every call; prefer `buildCodeIndex` + `findExactSkuCode`
 * inside the OCR hot path.
 */
export function matchExactSkuCode(rawText: string, skus: SkuCodeRow[]): ExactCodeMatch | null {
  return findExactSkuCode(rawText, buildCodeIndex(skus));
}
