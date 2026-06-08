/**
 * In-app cosine similarity helpers for SKU RAG.
 *
 * Embeddings are persisted as JSON-encoded number[] in `taco_skus.embedding`
 * for now (pgvector extension is installed, but synchronize:true keeps the
 * column as text — migrating to vector(3072) would require turning sync off).
 */

export function dot(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

export function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

export function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

export function parseEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as number[]) : null;
  } catch {
    return null;
  }
}

/**
 * Score `candidates` against a single query vector and return the top `k`
 * sorted by descending cosine similarity. Discards candidates without a
 * valid embedding.
 */
export function topK<T extends { embedding: string | null }>(
  query: number[],
  candidates: T[],
  k: number,
): Array<{ item: T; score: number }> {
  const scored: Array<{ item: T; score: number }> = [];
  for (const c of candidates) {
    const v = parseEmbedding(c.embedding);
    if (!v) continue;
    scored.push({ item: c, score: cosine(query, v) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
