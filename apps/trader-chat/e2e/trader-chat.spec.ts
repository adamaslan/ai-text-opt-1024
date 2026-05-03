import { test, expect, Page } from "@playwright/test";

// ── Shared mock helpers ───────────────────────────────────────────────────────

const MOCK_CHAT_RESPONSE = {
  answer:
    "T1 traders use momentum breakouts with tight stops, typically risking 1–2% per trade.",
  tool_calls: [],
  llm_provider: "gemini",
  trader: "T1",
  sources: [
    {
      text_preview:
        "The Tactical Opportunist enters on confirmed breakouts with volume confirmation.",
      source_file: "t1-tactical-opportunist-100-questions.md",
      chunk_index: 4,
      rerank_score: 0.91,
    },
  ],
  context_empty: false,
};

const MOCK_HEALTH_RESPONSE = {
  status: "ok",
  checks: { chroma: "ok", embed_service: "ok", llm: "ok" },
};

/** Intercept /api/chat and /api/health with mock responses. */
async function mockApi(page: Page) {
  await page.route("**/api/chat", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CHAT_RESPONSE),
    });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_HEALTH_RESPONSE),
    });
  });
}

// ── Test 1: Trader toggle and starter questions ───────────────────────────────

test("trader toggle switches between T1 and T2 profiles", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  // App loads with T1 selected by default
  const t1Btn = page.getByRole("button", { name: /T1.*Tactical/i });
  const t2Btn = page.getByRole("button", { name: /T2.*Structured/i });

  await expect(t1Btn).toBeVisible();
  await expect(t2Btn).toBeVisible();

  // T1 starter questions are shown in empty state
  await expect(page.getByText(/How does T1 trade earnings plays/i)).toBeVisible();

  // Switch to T2
  await t2Btn.click();

  // T2 starter questions replace T1's
  await expect(page.getByText(/How does T2 pick long-term growth stocks/i)).toBeVisible();
  // T1-specific question is gone
  await expect(page.getByText(/How does T1 trade earnings plays/i)).not.toBeVisible();

  // Header subtitle updates to T2 profile name (the <p> inside the header)
  await expect(page.locator("header").getByText(/Structured Growth Investor/i)).toBeVisible();
});

// ── Test 2: Full chat flow — send message, receive answer, sources appear ─────

test("sending a message shows assistant reply and sources panel", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  const textarea = page.locator("textarea");
  const sendBtn  = page.getByRole("button", { name: /send/i });

  // Type a question
  await textarea.fill("How does T1 handle breakout trades?");
  await expect(sendBtn).toBeEnabled();

  // Submit
  await sendBtn.click();

  // User bubble appears
  await expect(page.getByText("How does T1 handle breakout trades?")).toBeVisible();

  // Assistant reply appears (from mock)
  await expect(
    page.getByText(/T1 traders use momentum breakouts/i)
  ).toBeVisible({ timeout: 10_000 });

  // Sources panel appears with the mocked source file
  await expect(
    page.getByText(/t1-tactical-opportunist-100-questions\.md/i)
  ).toBeVisible();

  // Score badge shows 91% (rerank_score 0.91 → 91%)
  await expect(page.getByText("91%")).toBeVisible();
});

// ── Test 3: Clear chat restores empty state ───────────────────────────────────

test("clear button resets chat to empty state", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");

  const textarea = page.locator("textarea");

  // Send a message to populate the chat
  await textarea.fill("What is a covered call?");
  await page.keyboard.press("Enter");

  // Wait for assistant reply
  await expect(
    page.getByText(/T1 traders use momentum breakouts/i)
  ).toBeVisible({ timeout: 10_000 });

  // Clear button is now enabled
  const clearBtn = page.getByRole("button", { name: /clear/i });
  await expect(clearBtn).toBeEnabled();
  await clearBtn.click();

  // Messages gone — empty state prompt returns
  await expect(page.getByText(/Ask the Tactical Opportunist/i)).toBeVisible();

  // Clear button is disabled again (nothing to clear)
  await expect(clearBtn).toBeDisabled();
});
