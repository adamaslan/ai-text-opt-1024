// lib/llm.ts — LLM dispatch layer.
// Selects Gemini or Mistral at runtime via LLM_PROVIDER env var so the
// RAG pipeline can switch models without touching application code.

export type LLMProvider = "gemini" | "mistral";

export async function callLLM(prompt: string): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? "gemini") as LLMProvider;

  if (provider === "gemini") {
    return callGemini(prompt);
  } else if (provider === "mistral") {
    return callMistral(prompt);
  }
  throw new Error(`Unknown LLM_PROVIDER: "${provider}". Valid: "gemini" | "mistral".`);
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Navigate Gemini's nested response envelope: candidates[0].content.parts[0].text
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callMistral(prompt: string): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set");

  const model = process.env.MISTRAL_MODEL ?? "mistral-small-latest";

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Mistral API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export function getLLMProvider(): LLMProvider {
  return (process.env.LLM_PROVIDER ?? "gemini") as LLMProvider;
}
