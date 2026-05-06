import { readFile } from "fs/promises";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

const GCP3_BACKEND_URL = process.env.GCP3_BACKEND_URL || "http://localhost:8080";
const FETCH_TIMEOUT_MS = 30_000;

const RESEARCH_HEADERS = {
  "X-Research-Only": "true",
  "Cache-Control": "no-store",
};

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "content-type",
  "x-api-key",
  "x-request-id",
  "x-correlation-id",
  "x-research-only",
] as const;

function replaceRunId(value: unknown, runId: string): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceRunId(item, runId));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        key === "run_id" ? runId : replaceRunId(item, runId),
      ]),
    );
  }
  return value;
}

function forwardedHeaders(request: NextRequest) {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  if (!headers.has("Content-Type") && request.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

async function parseJsonResponse(response: Response): Promise<Record<string, unknown> | null> {
  if (response.status === 204 || response.status === 205) return null;

  const raw = await response.text();
  if (!raw.trim()) return null;

  return JSON.parse(raw) as Record<string, unknown>;
}

export async function fixtureJson(fileName: string, runId?: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(process.cwd(), "data", fileName), "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return (runId ? replaceRunId(parsed, runId) : parsed) as Record<string, unknown>;
}

export async function fixtureResponse(fileName: string, runId?: string) {
  return NextResponse.json(await fixtureJson(fileName, runId), {
    headers: {
      ...RESEARCH_HEADERS,
      "X-Data-Source": "local-fixture",
    },
  });
}

export async function triggerFixture(system: "swing" | "growth") {
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return NextResponse.json(
    {
      run_id: `${system}_${now}_dry_run`,
      status: "queued",
      research_only: true,
    },
    {
      status: 202,
      headers: {
        ...RESEARCH_HEADERS,
        "X-Data-Source": "local-fixture",
      },
    },
  );
}

export async function proxyAgentJson(
  request: NextRequest,
  agentPath: string,
  fallbackFile: string,
  fallbackRunId?: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body = request.method === "GET" ? undefined : await request.text();
    const response = await fetch(`${GCP3_BACKEND_URL}${agentPath}`, {
      method: request.method,
      signal: controller.signal,
      body,
      headers: forwardedHeaders(request),
    });

    if (!response.ok) return await fixtureResponse(fallbackFile, fallbackRunId);

    const payload = await parseJsonResponse(response);
    if (!payload) return await fixtureResponse(fallbackFile, fallbackRunId);

    const researchHeader = response.headers.get("X-Research-Only") === "true";
    return NextResponse.json(payload, {
      headers: {
        ...RESEARCH_HEADERS,
        "X-Research-Only": researchHeader || payload?.research_only === true ? "true" : "false",
        "X-Data-Source": "gcp3",
      },
    });
  } catch {
    return await fixtureResponse(fallbackFile, fallbackRunId);
  } finally {
    clearTimeout(timeout);
  }
}
