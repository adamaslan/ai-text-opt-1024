import { NextRequest } from "next/server";
import { proxyAgentJson } from "@/lib/agentProxy";

interface Context {
  params: { run_id: string };
}

export async function GET(request: NextRequest, { params }: Context) {
  const runId = decodeURIComponent(params.run_id);
  return proxyAgentJson(request, `/agents/swing/${encodeURIComponent(runId)}`, "swing-run-fixture.json", runId);
}
