// lib/openrouter.ts — OpenRouter chat client with free-model fallback.
//
// Mirrors nuwrrrld-portal's lib/openrouter.ts (fetchWithModelFallback): walk a
// chain of free-tier models, falling through on 402 (quota) / 429 (rate limit) /
// 5xx / network error / per-attempt timeout, and failing fast on other 4xx.
// Keep this file identical in backend/lib and apps/trader-chat/lib.

const OR_BASE = "https://openrouter.ai/api/v1";
const APP_REFERER = "https://financial.nuwrrrld.com";
const APP_TITLE = "ai-text-opt-1024";

/** Per-model attempt budget; a slow model is skipped rather than blocking the chain. */
export const MODEL_ATTEMPT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS = new Set([402, 429]);

// Same chain the portal ships (auto-refreshed there by refresh-free-models).
// Override without a deploy via OPENROUTER_MODELS="a:free,b:free".
const DEFAULT_FREE_MODEL_CHAIN = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "liquid/lfm-2.5-2.6b:free",
  "dots-studio/dots-3-note-preview:free",
  "inclusionai/ling-3.0-flash-fin:free",
];

export function getModelChain(): string[] {
  const override = (process.env.OPENROUTER_MODELS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return override.length ? override : DEFAULT_FREE_MODEL_CHAIN;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  text: string;
  model: string;
  finishReason: string | null;
}

export class LLMUnavailableError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`OpenRouter ${status}: all models in chain failed`);
    this.name = "LLMUnavailableError";
    this.status = status;
  }
}

export class LLMEmptyResponseError extends Error {
  readonly finishReason: string | null;
  constructor(finishReason: string | null) {
    super(`LLM returned no content (finish_reason=${finishReason ?? "unknown"})`);
    this.name = "LLMEmptyResponseError";
    this.finishReason = finishReason;
  }
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<CompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  let lastStatus = 503;
  let lastEmpty: LLMEmptyResponseError | null = null;

  for (const model of getModelChain()) {
    try {
      const res = await fetch(`${OR_BASE}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(MODEL_ATTEMPT_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": APP_REFERER,
          "X-Title": APP_TITLE,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 1024,
        }),
      });

      if (!res.ok) {
        lastStatus = res.status;
        await res.body?.cancel().catch(() => {});
        if (RETRYABLE_STATUS.has(res.status) || res.status >= 500) continue;
        break; // other 4xx: bad request/auth — trying more models won't help
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const text: string = choice?.message?.content ?? "";
      const finishReason: string | null = choice?.finish_reason ?? null;
      if (!text.trim()) {
        // Free models sometimes answer only into `reasoning` or return "" —
        // treat as a failed attempt and let the next model try.
        lastEmpty = new LLMEmptyResponseError(finishReason);
        continue;
      }
      return { text, model, finishReason };
    } catch {
      // network error or per-attempt timeout — transient, try the next model
    }
  }

  if (lastEmpty) throw lastEmpty;
  throw new LLMUnavailableError(lastStatus);
}

const KEY_CHECK_TTL_MS = 60_000;
const KEY_CHECK_TIMEOUT_MS = 3_000;
let keyCheck: { at: number; ok: boolean } | null = null;

/**
 * Health probe: true only if OPENROUTER_API_KEY is set AND OpenRouter accepts it.
 * Hits the free /auth/key endpoint (no model quota used); result cached for 60s
 * so frequent health polling doesn't hammer OpenRouter. A network failure counts
 * as unhealthy.
 */
export async function checkOpenRouterKey(): Promise<boolean> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return false;
  if (keyCheck && Date.now() - keyCheck.at < KEY_CHECK_TTL_MS) return keyCheck.ok;
  let ok = false;
  try {
    const res = await fetch(`${OR_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
    ok = res.ok;
    await res.body?.cancel().catch(() => {});
  } catch {
    ok = false;
  }
  keyCheck = { at: Date.now(), ok };
  return ok;
}
