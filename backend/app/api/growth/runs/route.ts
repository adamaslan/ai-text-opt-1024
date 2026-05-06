import { NextRequest } from "next/server";
import { proxyAgentJson, triggerFixture } from "@/lib/agentProxy";

export async function GET(request: NextRequest) {
  return proxyAgentJson(request, "/agents/growth/latest", "growth-run-fixture.json");
}

export async function POST(request: NextRequest) {
  if (!process.env.GCP3_BACKEND_URL) return triggerFixture("growth");
  return proxyAgentJson(request, "/agents/growth/run", "growth-run-fixture.json");
}
