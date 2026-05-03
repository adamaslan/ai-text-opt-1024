"use client";

import { useState } from "react";
import type { Source } from "./ChatMessage";

interface Props { sources: Source[] }

const scoreColor = (s: number) => {
  if (s >= 0.85) return "#10b981";
  if (s >= 0.65) return "#f59e0b";
  return "#ef4444";
};

export default function SourcesPanel({ sources }: Props) {
  const [open, setOpen]         = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!sources.length) return null;

  return (
    <aside
      className="glass"
      style={{
        width:         open ? "280px" : "44px",
        flexShrink:    0,
        borderLeft:    "1px solid var(--border)",
        transition:    "width 0.3s cubic-bezier(0.4,0,0.2,1)",
        overflow:      "hidden",
        display:       "flex",
        flexDirection: "column",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        title={open ? "Collapse" : "Expand sources"}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "8px",
          padding:      "14px",
          background:   "transparent",
          color:        "var(--text-secondary)",
          borderBottom: open ? "1px solid var(--border)" : "none",
          whiteSpace:   "nowrap",
          width:        "100%",
          textAlign:    "left",
        }}
      >
        <span style={{ fontSize: "13px" }}>{open ? "◀" : "▶"}</span>
        {open && (
          <span style={{ fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Sources · {sources.length}
          </span>
        )}
      </button>

      {open && (
        <ul style={{ overflowY: "auto", flex: 1, padding: "10px", listStyle: "none", display: "flex", flexDirection: "column", gap: "7px" }}>
          {sources.map((src, i) => (
            <li key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 35}ms` }}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                style={{
                  width:         "100%",
                  textAlign:     "left",
                  background:    expanded === i ? "rgba(59,130,246,0.07)" : "rgba(255,255,255,0.03)",
                  border:        `1px solid ${expanded === i ? "var(--border-accent)" : "var(--border)"}`,
                  borderRadius:  "var(--radius-md)",
                  padding:       "10px 11px",
                  color:         "var(--text-primary)",
                  display:       "flex",
                  flexDirection: "column",
                  gap:           "5px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace", color: "#3b82f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {src.source_file || "—"}
                  </span>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: scoreColor(src.rerank_score), flexShrink: 0 }}>
                    {(src.rerank_score * 100).toFixed(0)}%
                  </span>
                </div>
                <span
                  style={{
                    fontSize:            "0.77rem",
                    color:               "var(--text-muted)",
                    lineHeight:          1.5,
                    overflow:            "hidden",
                    display:             "-webkit-box",
                    WebkitLineClamp:     expanded === i ? 20 : 2,
                    WebkitBoxOrient:     "vertical",
                  }}
                >
                  {src.text_preview}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
