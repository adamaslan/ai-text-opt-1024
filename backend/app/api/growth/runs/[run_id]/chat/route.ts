import { NextRequest } from "next/server";
import { proxyAgentJson } from "@/lib/agentProxy";

interface Context {
  params: { run_id: string };
}

export async function POST(request: NextRequest, { params }: Context) {
  const runId = decodeURIComponent(params.run_id);
  return proxyAgentJson(request, `/agents/growth/${encodeURIComponent(runId)}/chat`, "growth-chat-fixture.json", runId);
}
