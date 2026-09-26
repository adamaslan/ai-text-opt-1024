// app/api/health/route.ts
// GET /api/health — aggregate health: ChromaDB + embed service + LLM key check (OpenRouter).

import { NextResponse } from "next/server";
import { checkOpenRouterKey } from "@/lib/openrouter";
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

  // LLM: key must be set and accepted by OpenRouter (cached probe)
  checks.llm = (await checkOpenRouterKey()) ? "ok" : "error";

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
