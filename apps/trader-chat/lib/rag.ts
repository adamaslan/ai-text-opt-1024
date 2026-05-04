// lib/rag.ts — ChromaDB RAG restricted to T1/T2 trader files.

import { getCollection, COLLECTION_NAME } from "./chroma";

const EMBED_SERVICE   = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8001";
const RAG_TOP_K       = Math.min(
  Number(process.env.RAG_TOP_K    ?? 8),
  Number(process.env.RAG_MAX_TOP_K ?? 20)
);
const SCORE_THRESHOLD = Number(process.env.RAG_SCORE_THRESHOLD ?? 0.75);

export type TraderTag = "T1" | "T2";

const TRADER_FILES: Record<TraderTag, string> = {
  T1: "t1-tactical-opportunist-100-questions.md",
  T2: "t2-structured-growth-investor-100-questions.md",
};

export interface RagSource {
  text_preview: string;
  source_file:  string;
  chunk_index:  number;
  distance:     number;
}

export interface RagResult {
  context: string;
  sources: RagSource[];
  empty:   boolean;
}

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(`${EMBED_SERVICE}/embed`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ texts: [text], is_query: true }),
    signal:  AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Embed service error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.embeddings?.[0]) throw new Error("Embed service returned empty embeddings");
  return data.embeddings[0];
}

export async function queryTrader(
  queryText: string,
  trader: TraderTag,
  nResults = RAG_TOP_K
): Promise<RagResult> {
  const [queryEmbedding, collection] = await Promise.all([
    embedQuery(queryText),
    getCollection(),
  ]);

  const raw = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults,
    include: ["documents", "metadatas", "distances"] as any,
    where:   { source_file: TRADER_FILES[trader] },
  } as any);

  const ids:   string[] = raw.ids[0]           ?? [];
  const docs:  string[] = (raw.documents[0]    ?? []) as string[];
  const dists: number[] = raw.distances[0]     ?? [];
  const metas: any[]    = raw.metadatas[0]     ?? [];

  const filtered = ids
    .map((id, i) => ({ id, doc: docs[i], dist: dists[i], meta: metas[i] }))
    .filter((r) => r.dist <= SCORE_THRESHOLD);

  if (!filtered.length) return { context: "", sources: [], empty: true };

  const context = filtered.map((r) => r.doc).join("\n\n---\n\n");
  const sources: RagSource[] = filtered.map((r) => ({
    text_preview: r.meta?.text_preview ?? r.doc?.slice(0, 200) ?? "",
    source_file:  r.meta?.source_file  ?? "",
    chunk_index:  r.meta?.chunk_index  ?? 0,
    distance:     r.dist,
  }));

  console.log(JSON.stringify({
    event:      "rag_query",
    trader,
    n_returned: filtered.length,
    collection: COLLECTION_NAME,
  }));

  return { context, sources, empty: false };
}

export function buildPrompt(
  query:    string,
  trader:   TraderTag,
  ragResult: RagResult
): string {
  const profile = trader === "T1"
    ? "Tactical Opportunist (T1) — short-term, momentum-driven, options-heavy"
    : "Structured Growth Investor (T2) — long-term, fundamentals-first, disciplined sizing";

  if (ragResult.empty) {
    return `You are an expert trading assistant specializing in the ${profile} trader profile.
Answer the following question based on your knowledge of this trader's philosophy.
If unsure, say so clearly.

Question: ${query}`;
  }

  return `You are an expert trading assistant specializing in the ${profile} trader profile.
Answer the following question using the context below, which comes directly from ${profile} knowledge base.
Be specific, actionable, and stay true to the ${trader} philosophy.

Context:
${ragResult.context}

Question: ${query}`;
}
