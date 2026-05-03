// lib/chroma.ts — ChromaDB client for trader-chat.
// Reads from the same collection already ingested by ai-text-opt-1024.

import { ChromaClient, CloudClient, Collection } from "chromadb";

export class ChromaUnavailableError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ChromaUnavailableError";
  }
}

const mode = process.env.CHROMA_MODE ?? "local";

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

const COLLECTION_BASE    = process.env.CHROMA_COLLECTION ?? "ideas_1024d";
const COLLECTION_VERSION = process.env.CHROMA_COLLECTION_VERSION ?? "2";
export const COLLECTION_NAME = `${COLLECTION_BASE}_v${COLLECTION_VERSION}_staging`;

let _client: ChromaClient | null = null;

function getRawClient(): ChromaClient {
  if (_client) return _client;
  if (mode === "cloud") {
    _client = new CloudClient({
      apiKey:   process.env.CHROMA_API_KEY!,
      tenant:   process.env.CHROMA_TENANT!,
      database: process.env.CHROMA_DATABASE!,
    });
  } else {
    _client = new ChromaClient({ path: "http://localhost:8000" });
  }
  return _client;
}

export async function getChromaClient(): Promise<ChromaClient> {
  const client = getRawClient();
  try {
    await client.heartbeat();
  } catch (err) {
    throw new ChromaUnavailableError(
      `ChromaDB heartbeat failed (mode=${mode}): ${(err as Error).message}`
    );
  }
  return client;
}

export async function getCollection(): Promise<Collection> {
  const client = await getChromaClient();
  return client.getCollection({ name: COLLECTION_NAME, embeddingFunction: undefined });
}
