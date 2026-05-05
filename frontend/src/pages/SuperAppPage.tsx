import { useEffect, useMemo, useState } from "react";

type AutomationStatus = "idle" | "running" | "complete";

interface Agent {
  name: string;
  role: string;
  model: string;
  focus: string;
  confidence: number;
}

interface Idea {
  title: string;
  market: string;
  edge: string;
  automation: string;
  revenue: string;
  risk: string;
  score: number;
}

interface ToolNode {
  name: string;
  job: string;
  status: "ready" | "live" | "queued";
}

interface MarketCandidate {
  symbol: string;
  score: number;
  reason: string;
}

const agents: Agent[] = [
  {
    name: "Scout",
    role: "Data hunter",
    model: "market data + RAG",
    focus: "Find dislocations across equities, options, crypto, ETF flows, and saved reports.",
    confidence: 86,
  },
  {
    name: "Quant",
    role: "Signal engine",
    model: "indicators + anomaly models",
    focus: "Blend RSI, MACD, Bollinger compression, Fibonacci, volume, and sector momentum.",
    confidence: 82,
  },
  {
    name: "Strategist",
    role: "Money model",
    model: "LLM council",
    focus: "Turn signals into products, trades, subscriptions, alerts, and automation loops.",
    confidence: 90,
  },
  {
    name: "Risk",
    role: "Kill switch",
    model: "rules + critic AI",
    focus: "Reject ideas with bad liquidity, bad reward/risk, credential risk, or weak evidence.",
    confidence: 88,
  },
  {
    name: "Operator",
    role: "Automation runner",
    model: "cron + webhook + API tools",
    focus: "Ship repeatable workflows with Firestore cache, notifications, and audit logs.",
    confidence: 84,
  },
];

const tools: ToolNode[] = [
  { name: "yfinance", job: "OHLCV fetch and fallback quote history", status: "ready" },
  { name: "Indicator Engine", job: "RSI, MACD, ATR, Bollinger, stochastic, Fibonacci", status: "live" },
  { name: "Signal Detector", job: "Strength scoring across bullish, bearish, neutral, weak", status: "live" },
  { name: "Gemini/Mistral", job: "Provider-swappable AI analysis with retry and critique passes", status: "ready" },
  { name: "Chroma/Zilliz", job: "Trader memory, documents, reports, and semantic retrieval", status: "ready" },
  { name: "Voyage Rerank", job: "Compress noisy evidence into the most useful source set", status: "queued" },
  { name: "Firestore", job: "Cached analysis, signals, AI outputs, and daily snapshots", status: "live" },
  { name: "Schwab Themes", job: "Trader profiles, portfolio archetypes, tax behavior", status: "ready" },
  { name: "Bitcoin/Lightning", job: "Paid signal checkout, subscriptions, and reconciliation", status: "ready" },
  { name: "Cron + Alerts", job: "Pre-market scan, intraday refresh, webhook follow-up", status: "queued" },
];

const seedIdeas: Idea[] = [
  {
    title: "Paid Alpha Briefs From Recursive AI Councils",
    market: "Retail traders, advisors, small funds",
    edge: "Package the pipeline's 50-stock signal reports into daily ranked briefs with debate traces.",
    automation: "Fetch -> indicators -> first AI read -> critic AI -> risk AI -> monetization AI -> email/paywall.",
    revenue: "$49-$299/month subscriptions plus premium custom watchlists.",
    risk: "Must label outputs as research and avoid personalized advice.",
    score: 94,
  },
  {
    title: "Options Volatility Harvester",
    market: "Options traders around earnings and macro events",
    edge: "Use Bollinger compression, ATR expansion, delta-surface notebooks, and catalyst timing.",
    automation: "Scan IV/range -> propose spreads -> run decay stress -> reject weak liquidity -> alert.",
    revenue: "Premium alerts, model portfolio licensing, and API access.",
    risk: "Needs live options chain data before production trade suggestions.",
    score: 89,
  },
  {
    title: "Tax-Aware Rotation Copilot",
    market: "Active Schwab-style portfolios",
    edge: "Blend Trader 1 tax-lot behavior with Trader 2 thematic allocation to improve after-tax returns.",
    automation: "Import lots -> detect wash-sale risk -> harvest candidates -> replace exposure -> explain.",
    revenue: "B2C SaaS, advisor dashboard, tax-season export.",
    risk: "Requires brokerage connectivity and compliance review.",
    score: 87,
  },
  {
    title: "Crypto Checkout For Finance Products",
    market: "Global buyers of research, alerts, and one-off reports",
    edge: "Bitcoin/Lightning invoices reduce card friction and support high-margin digital products.",
    automation: "Create order -> invoice -> webhook -> unlock report -> reconcile missed payments.",
    revenue: "One-time reports, memberships, API keys, and paid bots.",
    risk: "Processor/webhook reliability and tax accounting need strong logs.",
    score: 84,
  },
  {
    title: "AI Infrastructure Basket Scout",
    market: "Thematic growth investors",
    edge: "Track semis, nuclear, quantum, data-center, cybersecurity, and power infrastructure together.",
    automation: "Theme graph -> signal scan -> valuation guardrails -> risk clustering -> rebalance ideas.",
    revenue: "ETF-like model portfolios, newsletters, and licensing.",
    risk: "Can overfit popular narratives; needs valuation and drawdown constraints.",
    score: 82,
  },
];

const automationSteps = [
  "Map finance folders from VS Code workspace history",
  "Load project memory: pipeline, RAG, Schwab profiles, crypto workflow",
  "Fetch cached swing-trade candidates from the local API",
  "Run Scout pass over symbols, sectors, and product opportunities",
  "Run Quant pass over indicators, volatility, and anomalies",
  "Run Strategist pass to convert signals into revenue models",
  "Run Risk pass to reject bad liquidity, leverage, and compliance traps",
  "Run Operator pass to create a repeatable launch sequence",
  "Re-query AI council with the critic output and promote only durable ideas",
];

function pct(value: number) {
  return `${Math.max(0, Math.min(100, value)).toFixed(0)}%`;
}

function buildRecursiveRounds(iterations: number, ideas: Idea[], candidates: MarketCandidate[]) {
  const topTicker = candidates[0]?.symbol ?? "NVDA";
  return Array.from({ length: iterations }, (_, index) => {
    const idea = ideas[index % ideas.length];
    const agent = agents[index % agents.length];
    const confidence = Math.min(98, idea.score + index - (index > 3 ? 2 : 0));
    return {
      round: index + 1,
      agent: agent.name,
      title: idea.title,
      output:
        index % 2 === 0
          ? `Use ${topTicker} and adjacent themes as the evidence anchor, then sell the insight as a repeatable workflow.`
          : `Ask a second AI to attack the thesis; keep it only if revenue, risk, and data freshness survive.`,
      confidence,
    };
  });
}

export default function SuperAppPage() {
  const [status, setStatus] = useState<AutomationStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [iterations, setIterations] = useState(7);
  const [riskStrictness, setRiskStrictness] = useState(68);
  const [marketCandidates, setMarketCandidates] = useState<MarketCandidate[]>([]);
  const [marketNote, setMarketNote] = useState("Local swing endpoint not queried yet.");

  const scoredIdeas = useMemo(() => {
    return seedIdeas
      .map((idea, index) => ({
        ...idea,
        score: Math.max(50, Math.min(99, idea.score + iterations - Math.round(riskStrictness / 18) - index)),
      }))
      .sort((a, b) => b.score - a.score);
  }, [iterations, riskStrictness]);

  const rounds = useMemo(
    () => buildRecursiveRounds(iterations, scoredIdeas, marketCandidates),
    [iterations, scoredIdeas, marketCandidates],
  );

  const activeTools = tools.filter((tool) => tool.status === "live").length + Math.floor(stepIndex / 3);
  const automationProgress =
    status === "complete" ? 100 : status === "running" ? ((stepIndex + 1) / automationSteps.length) * 100 : 0;

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      setStepIndex((current) => {
        if (current >= automationSteps.length - 1) {
          window.clearInterval(timer);
          setStatus("complete");
          return current;
        }
        return current + 1;
      });
    }, 850);
    return () => window.clearInterval(timer);
  }, [status]);

  const runAutomation = () => {
    setStepIndex(0);
    setStatus("running");
  };

  const loadMarketScan = async () => {
    setMarketNote("Querying /api/swing-predictions for cached or live candidates...");
    try {
      const res = await fetch("/api/swing-predictions?universe=sp500&top_n=5&force_refresh=false");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const buy = (data.buy_candidates ?? []).slice(0, 5).map((cand: any) => ({
        symbol: cand.symbol,
        score: cand.score,
        reason: cand.reason,
      }));
      setMarketCandidates(buy);
      setMarketNote(`Loaded ${buy.length} ranked candidates from the local prediction API.`);
    } catch (error: any) {
      setMarketCandidates([
        { symbol: "NVDA", score: 91, reason: "AI infrastructure bellwether for signal product demos." },
        { symbol: "MU", score: 87, reason: "Memory cycle plus existing Fibonacci and report assets." },
        { symbol: "IBIT", score: 84, reason: "Bitcoin ETF theme connects trading signals to crypto checkout." },
        { symbol: "OKLO", score: 80, reason: "Power demand narrative pairs with AI data-center thesis." },
        { symbol: "RGTI", score: 76, reason: "Speculative quantum watchlist for asymmetric alerts." },
      ]);
      setMarketNote(`Using local fallback candidates because the API was unavailable: ${error.message}`);
    }
  };

  return (
    <main className="super-page">
      <section className="super-hero">
        <div className="hero-copy">
          <div className="eyebrow">AI Alpha OS</div>
          <h1>Recursive finance operator for signals, products, and money-making workflows.</h1>
          <p>
            Built from the finance folders found in VS Code history: ai-fin-opt2, nu-finance,
            schwab-nu1, crypto-pay1, and the current trader chat stack.
          </p>
          <div className="hero-actions">
            <button className="primary-action" onClick={runAutomation} disabled={status === "running"}>
              {status === "running" ? "Running..." : "Run AI Council"}
            </button>
            <button className="secondary-action" onClick={loadMarketScan}>
              Load Market Scan
            </button>
          </div>
        </div>

        <div className="command-panel">
          <div className="panel-topline">
            <span>Automation</span>
            <strong>{pct(automationProgress)}</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: pct(automationProgress) }} />
          </div>
          <div className="current-step">
            {status === "idle" ? "Ready to orchestrate the finance stack." : automationSteps[stepIndex]}
          </div>
          <div className="control-grid">
            <label>
              AI loops
              <input
                type="range"
                min="3"
                max="12"
                value={iterations}
                onChange={(event) => setIterations(Number(event.target.value))}
              />
              <span>{iterations}</span>
            </label>
            <label>
              Risk gate
              <input
                type="range"
                min="35"
                max="95"
                value={riskStrictness}
                onChange={(event) => setRiskStrictness(Number(event.target.value))}
              />
              <span>{riskStrictness}</span>
            </label>
          </div>
        </div>
      </section>

      <section className="metric-strip">
        <div>
          <span>{activeTools}</span>
          <p>tools orchestrated</p>
        </div>
        <div>
          <span>{agents.length}</span>
          <p>AI roles debating</p>
        </div>
        <div>
          <span>{scoredIdeas[0].score}</span>
          <p>top money score</p>
        </div>
        <div>
          <span>{marketCandidates.length || 5}</span>
          <p>ticker anchors</p>
        </div>
      </section>

      <section className="super-grid">
        <div className="super-section wide">
          <div className="section-heading">
            <span>Recursive AI Reasoning</span>
            <small>AI asks AI, gets critiqued, then asks AI again.</small>
          </div>
          <div className="round-list">
            {rounds.map((round) => (
              <article className="round-card" key={`${round.round}-${round.agent}`}>
                <div className="round-index">{round.round}</div>
                <div>
                  <strong>{round.agent}</strong>
                  <h3>{round.title}</h3>
                  <p>{round.output}</p>
                </div>
                <span className="confidence">{round.confidence}%</span>
              </article>
            ))}
          </div>
        </div>

        <div className="super-section">
          <div className="section-heading">
            <span>Agent Bench</span>
            <small>Specialized models with separate jobs.</small>
          </div>
          <div className="agent-list">
            {agents.map((agent) => (
              <article className="agent-card" key={agent.name}>
                <div className="agent-name">
                  <strong>{agent.name}</strong>
                  <span>{agent.confidence}%</span>
                </div>
                <p>{agent.role}</p>
                <small>{agent.focus}</small>
              </article>
            ))}
          </div>
        </div>

        <div className="super-section wide">
          <div className="section-heading">
            <span>Money-Making Ideas</span>
            <small>Ranked by edge, automation, revenue path, and risk gate.</small>
          </div>
          <div className="idea-grid">
            {scoredIdeas.map((idea) => (
              <article className="idea-card" key={idea.title}>
                <div className="idea-score">{idea.score}</div>
                <h3>{idea.title}</h3>
                <p>{idea.edge}</p>
                <dl>
                  <div>
                    <dt>Market</dt>
                    <dd>{idea.market}</dd>
                  </div>
                  <div>
                    <dt>Automation</dt>
                    <dd>{idea.automation}</dd>
                  </div>
                  <div>
                    <dt>Revenue</dt>
                    <dd>{idea.revenue}</dd>
                  </div>
                  <div>
                    <dt>Risk</dt>
                    <dd>{idea.risk}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </div>

        <div className="super-section">
          <div className="section-heading">
            <span>Tool Mesh</span>
            <small>Use every useful local finance capability.</small>
          </div>
          <div className="tool-list">
            {tools.map((tool) => (
              <article className={`tool-row ${tool.status}`} key={tool.name}>
                <span>{tool.name}</span>
                <p>{tool.job}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="super-section">
          <div className="section-heading">
            <span>Market Anchors</span>
            <small>{marketNote}</small>
          </div>
          <div className="candidate-list">
            {(marketCandidates.length ? marketCandidates : [
              { symbol: "NVDA", score: 91, reason: "AI infrastructure bellwether for product demos." },
              { symbol: "MU", score: 87, reason: "Memory cycle plus existing Fibonacci assets." },
              { symbol: "IBIT", score: 84, reason: "Connects Bitcoin ETF theme to crypto checkout." },
              { symbol: "OKLO", score: 80, reason: "Energy infrastructure narrative for AI power demand." },
              { symbol: "RGTI", score: 76, reason: "Quantum theme for asymmetric watchlist alerts." },
            ]).map((candidate) => (
              <article className="candidate-row" key={candidate.symbol}>
                <strong>{candidate.symbol}</strong>
                <span>{candidate.score.toFixed(0)}</span>
                <p>{candidate.reason}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="super-section">
          <div className="section-heading">
            <span>Launch Sequence</span>
            <small>Automation that can run every market day.</small>
          </div>
          <ol className="launch-list">
            <li>Pre-market: refresh data, rerank watchlists, detect gaps.</li>
            <li>Open: compare live moves against cached signal reports.</li>
            <li>Midday: AI council critiques top ideas and trims weak setups.</li>
            <li>Close: publish paid brief, archive evidence, update Firestore.</li>
            <li>Weekly: train product ideas against conversion and P/L feedback.</li>
          </ol>
        </div>
      </section>

      <footer className="research-note">
        Research mode only. This app generates ideas and workflows from local project context; it is not
        personalized investment, tax, or legal advice.
      </footer>
    </main>
  );
}
