"use client";

import ToolCallBadge from "./ToolCallBadge";

export interface Source {
  text_preview: string;
  source_file:  string;
  chunk_index:  number;
  rerank_score: number;
}

export interface ToolCall {
  name:   string;
  result: Record<string, unknown>;
}

interface Props {
  role:       "user" | "assistant";
  content:    string;
  trader?:    "T1" | "T2";
  sources?:   Source[];
  toolCalls?: ToolCall[];
}

const TRADER_COLORS = { T1: "#f59e0b", T2: "#10b981" };

export default function ChatMessage({ role, content, trader, sources, toolCalls }: Props) {
  const isUser  = role === "user";
  const tcolor  = trader ? TRADER_COLORS[trader] : "#3b82f6";

  return (
    <div
      className="animate-fade-in-up"
      style={{
        display:       "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap:           "12px",
        alignItems:    "flex-start",
        marginBottom:  "20px",
      }}
    >
      {/* Avatar */}
      <div
        aria-hidden
        style={{
          width:        "36px",
          height:       "36px",
          borderRadius: "50%",
          flexShrink:   0,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     "16px",
          background:   isUser
            ? `linear-gradient(135deg, ${tcolor}, #8b5cf6)`
            : "linear-gradient(135deg, #1a2235, #223)",
          border:       "1px solid rgba(255,255,255,0.1)",
        }}
      >
        {isUser ? "👤" : trader === "T1" ? "⚡" : trader === "T2" ? "🌱" : "🤖"}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: "76%", minWidth: "60px" }}>
        <div
          style={{
            padding:      "13px 17px",
            borderRadius: isUser ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
            background:   isUser
              ? `linear-gradient(135deg, ${tcolor}cc, #7c3aed)`
              : "var(--bg-glass)",
            backdropFilter: isUser ? undefined : "blur(16px)",
            border:       isUser ? "none" : "1px solid var(--border)",
            lineHeight:   1.65,
            fontSize:     "0.9375rem",
            whiteSpace:   "pre-wrap",
            wordBreak:    "break-word",
          }}
        >
          {content}
        </div>

        {/* Tool calls + source count */}
        {!isUser && (
          <div style={{ marginTop: "6px" }}>
            {toolCalls && <ToolCallBadge toolCalls={toolCalls} />}
            {sources && sources.length > 0 && (
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
                {sources.length} source{sources.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
