// lib/rag.ts
// RAG retrieval via ChromaDB + local embed service.
// No VoyageAI, no Zilliz, no external embedding API calls.
//
// Cost levers:
//   - Vectors embedded locally (embed_service.py on :8001)
//   - include=["documents","metadatas","distances"] — omit raw embeddings (large)
//   - n_results capped at RAG_MAX_TOP_K to prevent accidental large fetches
//   - Score threshold drops weak matches before LLM context

import crypto from "crypto";
import { getCollection, COLLECTION_NAME } from "./chroma";

const EMBED_SERVICE = process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8001";
const RAG_TOP_K = Math.min(
  Number(process.env.RAG_TOP_K ?? 10),
  Number(process.env.RAG_MAX_TOP_K ?? 50)
);
const SCORE_THRESHOLD = Number(process.env.RAG_SCORE_THRESHOLD ?? 0.75);

export interface RagSource {
  text_preview: string;
  source_file: string;
  chunk_index: number;
  distance: number;
}

export interface RagResult {
  context: string;           // concatenated doc text for LLM prompt
  sources: RagSource[];
  empty: boolean;            // true = no results above threshold
}

/** Embed a query text via the local embed service. */
async function embedQuery(text: string): Promise<number[]> {
  const start = Date.now();
  const res = await fetch(`${EMBED_SERVICE}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts: [text], is_query: true }),
  });
  if (!res.ok) {
    throw new Error(`Embed service error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const latencyMs = Date.now() - start;

  if (!data.embeddings?.[0]) {
    throw new Error("Embed service returned empty embeddings");
  }

  console.log(JSON.stringify({
    event: "embed_query",
    latency_ms: latencyMs,
    dimension: data.dimension,
  }));

  return data.embeddings[0];
}

/** Query ChromaDB and return filtered, ranked context for the LLM. */
export async function queryChroma(
  queryText: string,
  options: {
    nResults?: number;
    where?: Record<string, unknown>;
  } = {}
): Promise<RagResult> {
  const start = Date.now();
  const queryHash = crypto.createHash("sha1").update(queryText).digest("hex").slice(0, 8);
  const nResults = Math.min(options.nResults ?? RAG_TOP_K, Number(process.env.RAG_MAX_TOP_K ?? 50));

  const [queryEmbedding, collection] = await Promise.all([
    embedQuery(queryText),
    getCollection(),
  ]);

  const queryArgs: Record<string, unknown> = {
    queryEmbeddings: [queryEmbedding],
    nResults,
    include: ["documents", "metadatas", "distances"],
  };
  if (options.where) queryArgs.where = options.where;

  const raw = await collection.query(queryArgs as any);

  const ids: string[] = raw.ids[0] ?? [];
  const docs: string[] = (raw.documents[0] ?? []) as string[];
  const dists: number[] = raw.distances[0] ?? [];
  const metas: any[] = raw.metadatas[0] ?? [];

  // Filter by score threshold (cosine distance — lower is better)
  const filtered = ids
    .map((id, i) => ({ id, doc: docs[i], dist: dists[i], meta: metas[i] }))
    .filter((r) => r.dist <= SCORE_THRESHOLD);

  const nReturned = filtered.length;
  const gbReturnedEstimate =
    (filtered.reduce((sum, r) => sum + (r.doc?.length ?? 0), 0) / (1024 ** 3)) * 0.09;

  console.log(JSON.stringify({
    event: "rag_query",
    query_hash: queryHash,
    top_k: nResults,
    n_returned: nReturned,
    n_filtered_out: ids.length - nReturned,
    max_distance: dists[0] ?? null,
    latency_ms: Date.now() - start,
    gb_returned_estimate: gbReturnedEstimate.toFixed(8),
    collection: COLLECTION_NAME,
  }));

  if (!filtered.length) {
    return { context: "", sources: [], empty: true };
  }

  const context = filtered.map((r) => r.doc).join("\n\n---\n\n");
  const sources: RagSource[] = filtered.map((r) => ({
    text_preview: r.meta?.text_preview ?? r.doc?.slice(0, 200) ?? "",
    source_file: r.meta?.source_file ?? "",
    chunk_index: r.meta?.chunk_index ?? 0,
    distance: r.dist,
  }));

  return { context, sources, empty: false };
}

/** Trader-filtered query — restricts to specific source files. */
export async function queryTrader(
  queryText: string,
  traderTag: "T1" | "T2"
): Promise<RagResult> {
  const traderFiles: Record<"T1" | "T2", string[]> = {
    T1: ["t1-tactical-opportunist-100-questions.md"],
    T2: ["t2-structured-growth-investor-100-questions.md"],
  };

  return queryChroma(queryText, {
    where: { source_file: { $in: traderFiles[traderTag] } },
  });
}

/** Build a prompt string from RAG context + query. */
export function buildPrompt(query: string, ragResult: RagResult): string {
  if (ragResult.empty) {
    return `You are a trading assistant. Answer the following question based on your general knowledge.
Note: No specific context was found in the knowledge base for this query.

Question: ${query}`;
  }

  return `You are a trading assistant. Answer the following question based on the context below.
If the context does not contain enough information, say so clearly.

Context:
${ragResult.context}

Question: ${query}`;
}
