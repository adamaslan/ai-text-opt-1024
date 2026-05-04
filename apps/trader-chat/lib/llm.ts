// lib/llm.ts — Gemini LLM with function-calling (tool use).
//
// Gemini tools exposed to the model:
//   get_current_price      — look up a stock's last price (stubbed; wire to real API)
//   screen_stocks          — filter by sector/criteria relevant to T1 or T2
//   compare_traders        — contrast T1 vs T2 approach on a ticker or concept
//
// Flow: prompt → Gemini → if function_call returned → run tool → re-submit with
//       tool result → final text response.

export type LLMProvider = "gemini";

// ── Tool definitions ──────────────────────────────────────────────────────────

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name:        "get_current_price",
        description: "Get the current price and basic stats for a stock ticker. Use when the user asks about a specific ticker's price or recent performance.",
        parameters: {
          type: "OBJECT",
          properties: {
            ticker: {
              type:        "STRING",
              description: "Stock ticker symbol, e.g. AAPL, NVDA, SPY",
            },
          },
          required: ["ticker"],
        },
      },
      {
        name:        "screen_stocks",
        description: "Screen for stocks matching criteria aligned with T1 (momentum, options flow, earnings plays) or T2 (value, growth, sector trends). Returns a short list of candidates.",
        parameters: {
          type: "OBJECT",
          properties: {
            trader_profile: {
              type:        "STRING",
              enum:        ["T1", "T2"],
              description: "Which trader profile to screen for",
            },
            criteria: {
              type:        "STRING",
              description: "Natural language criteria, e.g. 'high IV rank options plays' or 'undervalued dividend growth'",
            },
          },
          required: ["trader_profile", "criteria"],
        },
      },
      {
        name:        "compare_traders",
        description: "Compare how T1 (Tactical Opportunist) and T2 (Structured Growth Investor) would approach the same ticker or concept differently.",
        parameters: {
          type: "OBJECT",
          properties: {
            topic: {
              type:        "STRING",
              description: "Ticker symbol or concept to compare, e.g. 'NVDA' or 'covered calls'",
            },
          },
          required: ["topic"],
        },
      },
    ],
  },
];

// ── Tool execution (stubs — replace with real data sources) ──────────────────

interface ToolResult {
  name:   string;
  result: Record<string, unknown>;
}

function executeTool(name: string, args: Record<string, string>): Record<string, unknown> {
  switch (name) {
    case "get_current_price": {
      // Stub: replace with a real market data fetch (e.g. Yahoo Finance, Polygon)
      return {
        ticker:        args.ticker?.toUpperCase() ?? "?",
        price:         null,
        change_pct:    null,
        note:          "Live price unavailable — wire MARKET_DATA_API_KEY to enable real prices.",
      };
    }

    case "screen_stocks": {
      // Stub: return placeholder — replace with real screener or GCP backend call
      return {
        trader_profile: args.trader_profile,
        criteria:       args.criteria,
        candidates:     [],
        note:           "Screener stub — connect to a real data source to return live candidates.",
      };
    }

    case "compare_traders": {
      // No live data needed — Gemini will synthesize from the prompt + RAG context
      return {
        topic:   args.topic,
        message: `Comparing T1 vs T2 on "${args.topic}" — answer synthesized from trader knowledge base.`,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Gemini API call (with tool loop) ─────────────────────────────────────────

export interface LLMResponse {
  text:       string;
  tool_calls: ToolResult[];
}

export async function callLLM(prompt: string): Promise<LLMResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const toolResults: ToolResult[] = [];

  // Initial request
  let contents: any[] = [{ role: "user", parts: [{ text: prompt }] }];

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ contents, tools: GEMINI_TOOLS }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);

  let data = await res.json();
  let candidate = data.candidates?.[0];

  // Tool-use loop — Gemini may request multiple tools per turn and multiple turns
  const MAX_TOOL_TURNS = 5;
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const fnCallParts = candidate?.content?.parts?.filter((p: any) => p.functionCall) ?? [];
    if (!fnCallParts.length) break;

    const modelPart = candidate.content;
    const functionResponses = fnCallParts.map((part: any) => {
      const fnCall = part.functionCall;
      const result = executeTool(fnCall.name, fnCall.args ?? {});
      toolResults.push({ name: fnCall.name, result });
      return { functionResponse: { name: fnCall.name, response: result } };
    });

    contents = [
      ...contents,
      { role: "model", parts: modelPart.parts },
      { role: "user", parts: functionResponses },
    ];

    const followUp = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ contents, tools: GEMINI_TOOLS }),
    });

    if (!followUp.ok) throw new Error(`Gemini follow-up error ${followUp.status}: ${await followUp.text()}`);
    data      = await followUp.json();
    candidate = data.candidates?.[0];
  }

  const text = candidate?.content?.parts
    ?.filter((p: any) => p.text)
    ?.map((p: any) => p.text)
    ?.join("") ?? "";

  return { text, tool_calls: toolResults };
}

export function getLLMProvider(): LLMProvider {
  return "gemini";
}
