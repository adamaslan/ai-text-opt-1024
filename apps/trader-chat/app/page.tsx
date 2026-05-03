"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import ChatMessage, { Source, ToolCall } from "@/components/ChatMessage";
import SourcesPanel from "@/components/SourcesPanel";

type Trader = "T1" | "T2";

interface Message {
  role:      "user" | "assistant";
  content:   string;
  trader?:   Trader;
  sources?:  Source[];
  toolCalls?: ToolCall[];
}

const TRADER_CONFIG: Record<Trader, { label: string; desc: string; color: string; icon: string; hint: string }> = {
  T1: {
    label: "T1 · Tactical",
    desc:  "Tactical Opportunist",
    color: "#f59e0b",
    icon:  "⚡",
    hint:  "Short-term momentum, earnings plays, options strategies",
  },
  T2: {
    label: "T2 · Structured",
    desc:  "Structured Growth Investor",
    color: "#10b981",
    icon:  "🌱",
    hint:  "Long-term growth, fundamental analysis, disciplined sizing",
  },
};

const STARTER_QUESTIONS: Record<Trader, string[]> = {
  T1: [
    "How does T1 trade earnings plays?",
    "Best options strategy for a breakout?",
    "How to manage a losing position quickly?",
    "What is IV crush and how to avoid it?",
  ],
  T2: [
    "How does T2 pick long-term growth stocks?",
    "Explain T2's position sizing rules",
    "When does T2 add to a position?",
    "How does T2 evaluate sector rotation?",
  ],
};

export default function TraderChatPage() {
  const [trader,     setTrader]     = useState<Trader>("T1");
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [latestSrcs, setLatestSrcs] = useState<Source[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clear messages when switching traders
  const switchTrader = (t: Trader) => {
    setTrader(t);
    setMessages([]);
    setLatestSrcs([]);
    inputRef.current?.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: msg, trader }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: msg, trader }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role:      "assistant",
          content:   data.answer,
          trader,
          sources:   data.sources ?? [],
          toolCalls: data.tool_calls ?? [],
        },
      ]);
      setLatestSrcs(data.sources ?? []);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ ${err.message || "Something went wrong."}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const cfg = TRADER_CONFIG[trader];

  return (
    <div style={{ display: "flex", width: "100%", height: "100dvh", overflow: "hidden" }}>

      {/* ── Main chat column ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <header
          className="glass"
          style={{
            padding:        "14px 22px",
            borderBottom:   "1px solid var(--border)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            gap:            "14px",
            flexShrink:     0,
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                fontSize:     "20px",
                background:   `linear-gradient(135deg, ${cfg.color}, #8b5cf6)`,
                borderRadius: "8px",
                padding:      "4px 7px",
                transition:   "background 0.4s ease",
              }}
            >
              {cfg.icon}
            </span>
            <div>
              <h1 style={{ fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.2 }}>
                Trader Chat
              </h1>
              <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "1px" }}>
                {cfg.desc} · Gemini + ChromaDB
              </p>
            </div>
          </div>

          {/* Trader toggle */}
          <div
            role="group"
            aria-label="Select trader profile"
            style={{
              display:      "flex",
              gap:          "3px",
              background:   "rgba(255,255,255,0.03)",
              border:       "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding:      "3px",
            }}
          >
            {(["T1", "T2"] as Trader[]).map((t) => {
              const c   = TRADER_CONFIG[t];
              const isOn = trader === t;
              return (
                <button
                  key={t}
                  onClick={() => switchTrader(t)}
                  title={c.hint}
                  style={{
                    padding:      "5px 16px",
                    borderRadius: "var(--radius-lg)",
                    background:   isOn ? c.color : "transparent",
                    color:        isOn ? "#fff" : "var(--text-secondary)",
                    fontWeight:   isOn ? 600 : 400,
                    fontSize:     "0.8rem",
                    boxShadow:    isOn ? `0 0 12px ${c.color}55` : "none",
                    transition:   "all var(--transition)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Clear */}
          <button
            onClick={() => { setMessages([]); setLatestSrcs([]); }}
            disabled={messages.length === 0}
            style={{
              padding:      "6px 13px",
              borderRadius: "var(--radius-md)",
              background:   "transparent",
              border:       "1px solid var(--border)",
              color:        messages.length === 0 ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize:     "0.78rem",
            }}
          >
            Clear
          </button>
        </header>

        {/* Messages */}
        <main
          style={{
            flex:          1,
            overflowY:     "auto",
            padding:       "24px",
            display:       "flex",
            flexDirection: "column",
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex:           1,
                display:        "flex",
                flexDirection:  "column",
                alignItems:     "center",
                justifyContent: "center",
                gap:            "14px",
                color:          "var(--text-muted)",
                textAlign:      "center",
                padding:        "40px",
              }}
            >
              <span style={{ fontSize: "44px" }}>{cfg.icon}</span>
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Ask the {cfg.desc}
              </p>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", maxWidth: "340px", lineHeight: 1.7 }}>
                {cfg.hint}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center", marginTop: "6px" }}>
                {STARTER_QUESTIONS[trader].map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{
                      padding:      "7px 14px",
                      borderRadius: "var(--radius-lg)",
                      background:   "rgba(255,255,255,0.04)",
                      border:       "1px solid var(--border)",
                      color:        "var(--text-secondary)",
                      fontSize:     "0.78rem",
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              trader={msg.trader}
              sources={msg.sources}
              toolCalls={msg.toolCalls}
            />
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 0 12px" }}>
              <div className="spinner" />
              <span style={{ fontSize: "0.83rem", color: "var(--text-muted)" }}>
                {cfg.desc} thinking…
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </main>

        {/* Input */}
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); sendMessage(); }}
          className="glass"
          style={{
            padding:     "13px 18px",
            borderTop:   "1px solid var(--border)",
            display:     "flex",
            alignItems:  "flex-end",
            gap:         "10px",
            flexShrink:  0,
          }}
        >
          <span
            style={{
              width:        "8px",
              height:       "8px",
              borderRadius: "50%",
              background:   cfg.color,
              boxShadow:    `0 0 8px ${cfg.color}`,
              flexShrink:   0,
              marginBottom: "11px",
            }}
            title={`Active: ${cfg.desc}`}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${cfg.desc}… (Shift+Enter for newline)`}
            rows={1}
            style={{
              flex:        1,
              resize:      "none",
              background:  "rgba(255,255,255,0.04)",
              border:      "1px solid var(--border)",
              borderRadius:"var(--radius-md)",
              padding:     "10px 13px",
              color:       "var(--text-primary)",
              fontSize:    "0.9375rem",
              lineHeight:  1.5,
              outline:     "none",
              fontFamily:  "Inter, sans-serif",
              transition:  "border-color var(--transition)",
              maxHeight:   "160px",
              overflowY:   "auto",
            }}
            onFocus={(e) => (e.target.style.borderColor = cfg.color)}
            onBlur={(e)  => (e.target.style.borderColor = "var(--border)")}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            style={{
              width:         "42px",
              height:        "42px",
              borderRadius:  "var(--radius-md)",
              background:    input.trim() && !loading
                ? `linear-gradient(135deg, ${cfg.color}, #7c3aed)`
                : "rgba(255,255,255,0.05)",
              color:         input.trim() && !loading ? "#fff" : "var(--text-muted)",
              fontSize:      "18px",
              flexShrink:    0,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
            }}
            aria-label="Send"
          >
            {loading
              ? <span className="spinner" style={{ width: "18px", height: "18px" }} />
              : "↑"
            }
          </button>
        </form>
      </div>

      {/* Sources sidebar */}
      <SourcesPanel sources={latestSrcs} />
    </div>
  );
}
