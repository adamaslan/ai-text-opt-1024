// app/api/chat/route.ts
// POST /api/chat — ChromaDB RAG + LLM, no LlamaIndex, no Zilliz.

import { NextRequest, NextResponse } from "next/server";
import { queryChroma, queryTrader, buildPrompt } from "@/lib/rag";
import { callLLM, getLLMProvider } from "@/lib/llm";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const requestCounts = new Map<string, { count: number; reset: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.reset) {
    requestCounts.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: { message?: string; trader_filter?: "T1" | "T2" | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const traderFilter = body.trader_filter ?? null;

  try {
    // Step 1: retrieve context from ChromaDB
    const ragResult = traderFilter
      ? await queryTrader(message, traderFilter)
      : await queryChroma(message);

    // Step 2: build prompt
    const prompt = buildPrompt(message, ragResult);

    // Step 3: call LLM
    const answer = await callLLM(prompt);

    return NextResponse.json({
      answer,
      llm_provider: getLLMProvider(),
      sources: ragResult.sources.map((s) => ({
        text_preview: s.text_preview,
        source_file: s.source_file,
        chunk_index: s.chunk_index,
        distance: s.distance,
        // cosine distance → similarity score (lower dist = higher similarity)
        rerank_score: parseFloat((1 - s.distance).toFixed(4)),
      })),
      context_empty: ragResult.empty,
    });
  } catch (err: any) {
    console.error("Chat route error:", err);
    const status = err.name === "ChromaUnavailableError" ? 503 : 500;
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status });
  }
}
