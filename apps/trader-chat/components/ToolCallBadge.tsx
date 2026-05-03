"use client";

interface ToolCall {
  name:   string;
  result: Record<string, unknown>;
}

interface Props {
  toolCalls: ToolCall[];
}

const TOOL_ICONS: Record<string, string> = {
  get_current_price: "📈",
  screen_stocks:     "🔍",
  compare_traders:   "⚖️",
};

export default function ToolCallBadge({ toolCalls }: Props) {
  if (!toolCalls.length) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
      {toolCalls.map((tc, i) => (
        <span
          key={i}
          title={JSON.stringify(tc.result, null, 2)}
          style={{
            fontSize:     "0.7rem",
            padding:      "3px 10px",
            borderRadius: "99px",
            background:   "rgba(139,92,246,0.12)",
            border:       "1px solid rgba(139,92,246,0.3)",
            color:        "#a78bfa",
            display:      "inline-flex",
            alignItems:   "center",
            gap:          "4px",
            cursor:       "help",
          }}
        >
          {TOOL_ICONS[tc.name] ?? "🔧"} {tc.name.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}
