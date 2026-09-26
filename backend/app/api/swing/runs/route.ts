import { NextRequest } from "next/server";
import { proxyAgentJson, triggerFixture } from "@/lib/agentProxy";

export async function GET(request: NextRequest) {
  return proxyAgentJson(request, "/agents/swing/latest", "swing-run-fixture.json");
}

export async function POST(request: NextRequest) {
  if (!process.env.GCP3_BACKEND_URL) return triggerFixture("swing");
  return proxyAgentJson(request, "/agents/swing/run", "swing-run-fixture.json");
}
