// lib/chroma.ts
// ChromaDB client singleton — replaces zilliz.ts.
//
// CHROMA_MODE=local  → ChromaClient connecting to http://localhost:8000
//   (start chroma server: chroma run --path chroma_db)
// CHROMA_MODE=cloud  → CloudClient with CHROMA_API_KEY/TENANT/DATABASE
//
// Cost note: always pass pre-computed embeddings; embedding_function is never
// set so Chroma never calls an external embedding API.

import { ChromaClient, CloudClient, Collection } from "chromadb";

export class ChromaUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ChromaUnavailableError";
  }
}

const mode = process.env.CHROMA_MODE ?? "local";

// Fail fast at boot rather than on first request
if (mode !== "local" && mode !== "cloud") {
  throw new Error(`Invalid CHROMA_MODE="${mode}". Must be "local" or "cloud".`);
}

if (mode === "cloud") {
  const required = ["CHROMA_API_KEY", "CHROMA_TENANT", "CHROMA_DATABASE"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`CHROMA_MODE=cloud but missing env vars: ${missing.join(", ")}`);
  }
}

const COLLECTION_BASE = process.env.CHROMA_COLLECTION ?? "ideas_1024d";
const COLLECTION_VERSION = process.env.CHROMA_COLLECTION_VERSION ?? "2";
// The backend queries the _staging collection directly. ingest.py writes there
// and validates before swapping — so staging IS the live collection in practice.
// Bump CHROMA_COLLECTION_VERSION to roll forward to a fresh collection without
// touching the old one (safe rollback by decrementing the version).
export const COLLECTION_NAME = `${COLLECTION_BASE}_v${COLLECTION_VERSION}_staging`;

let _client: ChromaClient | null = null;
let _lastHealthy = false;

export function getRawClient(): ChromaClient {
  if (_client) return _client;

  if (mode === "cloud") {
    _client = new CloudClient({
      apiKey: process.env.CHROMA_API_KEY!,
      tenant: process.env.CHROMA_TENANT!,
      database: process.env.CHROMA_DATABASE!,
    });
  } else {
    _client = new ChromaClient({ path: process.env.CHROMA_SERVER_URL ?? "http://localhost:8000" });
  }
  return _client;
}

/** Lazy-init client with heartbeat health check on first call. */
export async function getChromaClient(): Promise<ChromaClient> {
  const client = getRawClient();
  try {
    await client.heartbeat();
    _lastHealthy = true;
  } catch (err) {
    _lastHealthy = false;
    throw new ChromaUnavailableError(
      `ChromaDB heartbeat failed (mode=${mode}): ${(err as Error).message}`
    );
  }
  return client;
}

export function getLastHealthy(): boolean {
  return _lastHealthy;
}

/** Return the active collection (embedding_function=null — we pass vectors). */
export async function getCollection(): Promise<Collection> {
  const client = await getChromaClient();
  return client.getCollection({ name: COLLECTION_NAME, embeddingFunction: undefined });
}

/** Field names used across all query calls. */
export const FIELDS = {
  SOURCE_FILE: "source_file",
  CHUNK_INDEX: "chunk_index",
  CHAR_LEN: "char_len",
  CONTENT_HASH: "content_hash",
  INGESTED_AT: "ingested_at",
} as const;
