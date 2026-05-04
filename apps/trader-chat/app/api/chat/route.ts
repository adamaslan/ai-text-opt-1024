// POST /api/chat
// Required body: { message: string; trader: "T1" | "T2" }

import { NextRequest, NextResponse } from "next/server";
import { queryTrader, buildPrompt, TraderTag } from "@/lib/rag";
import { callLLM, getLLMProvider } from "@/lib/llm";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 60;
const requestCounts        = new Map<string, { count: number; reset: number }>();

function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.reset) {
    requestCounts.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(req: NextRequest) {
  // req.ip is set by Vercel/Next.js edge runtime from a trusted internal header
  // and cannot be spoofed by clients. Fall back to x-real-ip (also set by Vercel
  // and most reverse proxies), then "unknown". Never use x-forwarded-for directly:
  // it is client-controlled and trivially bypasses in-process rate limiting.
  const ip = req.ip ?? req.headers.get("x-real-ip") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: { message?: string; trader?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const trader = (body.trader ?? "T1") as TraderTag;
  if (trader !== "T1" && trader !== "T2") {
    return NextResponse.json({ error: 'trader must be "T1" or "T2"' }, { status: 400 });
  }

  try {
    const ragResult = await queryTrader(message, trader);
    const prompt    = buildPrompt(message, trader, ragResult);
    const llmResult = await callLLM(prompt);

    return NextResponse.json({
      answer:        llmResult.text,
      tool_calls:    llmResult.tool_calls,
      llm_provider:  getLLMProvider(),
      trader,
      sources:       ragResult.sources.map((s) => ({
        text_preview:  s.text_preview,
        source_file:   s.source_file,
        chunk_index:   s.chunk_index,
        rerank_score:  parseFloat((1 - s.distance).toFixed(4)),
      })),
      context_empty: ragResult.empty,
    });
  } catch (err: any) {
    console.error("Chat route error:", err);
    const status = err.name === "ChromaUnavailableError" ? 503 : 500;
    return NextResponse.json({ error: err.message ?? "Internal server error" }, { status });
  }
}
