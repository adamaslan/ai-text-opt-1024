// app/api/health/route.ts
// GET /api/health — aggregate health: ChromaDB + embed service + LLM env check.

import { NextResponse } from "next/server";
import { getChromaClient, getLastHealthy } from "@/lib/chroma";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  // ChromaDB
  try {
    await getChromaClient();
    checks.chroma = "ok";
  } catch {
    checks.chroma = "error";
  }

  // Embed service
  try {
    const res = await fetch(
      `${process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8001"}/health`,
      { signal: AbortSignal.timeout(3000) }
    );
    checks.embed_service = res.ok ? "ok" : "error";
  } catch {
    checks.embed_service = "error";
  }

  // LLM env (just key presence — don't call the API)
  const provider = process.env.LLM_PROVIDER ?? "gemini";
  const hasKey =
    provider === "gemini"
      ? !!process.env.GEMINI_API_KEY
      : !!process.env.MISTRAL_API_KEY;
  checks.llm = hasKey ? "ok" : "error";

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
