// GET /api/health

import { NextResponse } from "next/server";
import { getChromaClient } from "@/lib/chroma";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};

  try {
    await getChromaClient();
    checks.chroma = "ok";
  } catch {
    checks.chroma = "error";
  }

  try {
    const res = await fetch(
      `${process.env.EMBED_SERVICE_URL ?? "http://127.0.0.1:8001"}/health`,
      { signal: AbortSignal.timeout(3000) }
    );
    checks.embed_service = res.ok ? "ok" : "error";
  } catch {
    checks.embed_service = "error";
  }

  checks.llm = process.env.GEMINI_API_KEY ? "ok" : "error";

  const allOk = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: allOk ? "ok" : "degraded", checks },
    { status: allOk ? 200 : 503 }
  );
}
