import { FormEvent, useMemo, useState } from "react";
import ChatMessage, { Source } from "../ChatMessage";
import SourcesPanel from "../SourcesPanel";
import type { RagCitation, RagResponse } from "../../types/shared";
import ComplianceLabel from "./ComplianceLabel";
import StaleDataBadge from "./StaleDataBadge";
import AiDegradedBadge from "./AiDegradedBadge";

interface Message {
  role: "user" | "assistant";
  content: string;
  response?: RagResponse;
}

interface Props {
  system: "swing" | "growth";
  runId: string;
  onAsk: (message: string) => Promise<RagResponse>;
  onCitationClick?: (ticker: string, citation: RagCitation) => void;
}

function toSource(citation: RagCitation): Source {
  return {
    text_preview: citation.snippet,
    chunk_summary: citation.snippet,
    source_file: citation.source_doc_id,
    theme_name: `${citation.system} ${citation.collection} ${citation.ticker}`,
    rerank_score: citation.score,
  };
}

export default function RagChatPanel({ system, runId, onAsk, onCitationClick }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const latestWithCitations = [...messages].reverse().find((message) => message.response?.citations.length);
  const latestCitations = latestWithCitations?.response?.citations ?? [];
  const sources = useMemo(() => latestCitations.map(toSource), [latestCitations]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const response = await onAsk(text);
      const content = response.compliance_violation_detected
        ? "Compliance violation detected in the generated response. The answer was withheld."
        : response.answer;
      setMessages((current) => [...current, { role: "assistant", content, response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed.";
      setMessages((current) => [...current, { role: "assistant", content: message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rag-panel">
      <button className="rag-toggle" type="button" onClick={() => setExpanded((value) => !value)}>
        <span>{expanded ? "Hide Run Chat" : "Ask About This Run"}</span>
        <small>{system.toUpperCase()} · {runId}</small>
      </button>

      {expanded && (
        <div className="rag-body">
          <div className="rag-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className="rag-message-wrap">
                {message.response?.answer_grounded === false && (
                  <div className="inline-warning">Answer was not grounded in retrieved run evidence.</div>
                )}
                <ChatMessage
                  role={message.role}
                  content={message.content}
                  llmProvider={message.response?.provider_used}
                />
                {message.response && (
                  <div className="rag-meta">
                    <ComplianceLabel />
                    <AiDegradedBadge aiDegraded={message.response.ai_degraded} />
                  </div>
                )}
                {message.response?.citations.length ? (
                  <div className="citation-row">
                    {message.response.citations.map((citation) => (
                      <button
                        key={citation.chunk_id}
                        className="citation-chip"
                        type="button"
                        onClick={() => onCitationClick?.(citation.ticker, citation)}
                      >
                        <span>{citation.ticker}</span>
                        <span>{citation.collection}</span>
                        <StaleDataBadge isStale={citation.is_stale} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading && (
              <div className="loading-inline">
                <span className="spinner-sm" />
                <span>Thinking</span>
              </div>
            )}
          </div>
          {sources.length > 0 && (
            <div className="rag-sources">
              <SourcesPanel sources={sources} />
            </div>
          )}
          <form className="rag-form" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask a cited question about this run"
              rows={2}
            />
            <button className="primary-action compact" type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
