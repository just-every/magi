/**
 * ToolCallMessage Component – compact JSON‑first view (June 2025)
 * ------------------------------------------------------------------
 * • Parameters are now shown ONLY as an interactive JSON tree.
 * • The tool/function name wraps the tree with "name(" … ")" lines so it
 *   still reads like a function call.
 * • If params fail to parse as JSON, falls back to Markdown or plain text.
 * ------------------------------------------------------------------
 */

import React, { useMemo, useState } from "react";
import type { FC } from "react";

// ── Libraries ────────────────────────────────────────────────────────────────
import { JSONTree } from "react-json-tree";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ────────────────────────────────────────────────────────────────────
import { ToolCallMessage as ToolCallMessageType } from "../../context/SocketContext";

interface ToolCallMessageProps {
  message: ToolCallMessageType;
  rgb: string; // kept for upstream compatibility; unused here
  complete: boolean;
  callFollows: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const isMarkdowny = (s: string) => /[*_\[#`>|~-]/.test(s) && s.includes("\n");

const titleify = (name: string) =>
  name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function parseParams(raw: unknown): { obj: unknown | null; txt: string } {
  if (raw == null) return { obj: null, txt: "" };
  if (typeof raw === "object") return { obj: raw, txt: JSON.stringify(raw, null, 2) };
  const str = String(raw).trim();
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const parsed = JSON.parse(str);
      return { obj: parsed, txt: JSON.stringify(parsed, null, 2) };
    } catch {/* ignore – fallback to string */}
  }
  return { obj: null, txt: str };
}

// ── Component ────────────────────────────────────────────────────────────────
const ToolCallMessage: FC<ToolCallMessageProps> = ({ message, rgb, complete, callFollows }) => {
  // Memoised params
  const { obj: paramsObj, txt: paramsTxt } = useMemo(() => parseParams(message.toolParams), [message.toolParams]);

  // Dark‑mode flag (SSR‑safe)
  const [isDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Custom renderer for JSONTree string values → Markdown when useful
  // Custom renderer for JSONTree primitive values (string/number/boolean)
  const valueRenderer = (display: string, value: unknown, ...keyPath: (string | number)[]) => {
    if (typeof value !== "string") return <>{display}</>;

    const trimmed = value.trim();

    // 👉 Parse embedded JSON objects/arrays that are stored as strings
    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));

    if (looksLikeJson) {
      try {
        const parsed = JSON.parse(trimmed);
        return (
          <JSONTree
            data={parsed}
            hideRoot
            invertTheme={isDark}
            shouldExpandNodeInitially={(kp) => kp.length < 2}
            /* reuse the same renderer so nested strings also benefit */
            valueRenderer={valueRenderer as any}
          />
        );
      } catch {
        /* fall through to markdown/plain */
      }
    }

    // Render markdown if the string looks Markdown‑ish
    if (isMarkdowny(value)) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ p: (p) => <span {...p} /> }}>
          {value}
        </ReactMarkdown>
      );
    }

    // Plain string fall‑back
    return <>{display}</>;
  };

  // Fallback visual when params are not an object
  const renderFallback = () => {
    if (!paramsTxt) return null; // toolName() – no params

    if (isMarkdowny(paramsTxt)) {
      return (
        <div className="pt-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{paramsTxt}</ReactMarkdown>
        </div>
      );
    }

    return <pre className="pt-1 whitespace-pre-wrap text-sm">{paramsTxt}</pre>;
  };

  return (
    <div
      className={`message-group tool-message ${callFollows ? "call-follows" : ""}`}
      key={message.id}
    >
      <div className="message-bubble tool-bubble">
        {/* Header */}
        <div className="message-header">
          {message.agent?.model && <span className="message-model">{message.agent.model}</span>}
          <span className="message-title">
            {titleify(message.toolName)} {complete ? "" : "Running…"}
          </span>
        </div>

        {/* Function‑call wrapper */}
        <div className="tool-call-block font-mono text-sm">
          <div className="function-header">{`${message.toolName}(`}</div>

          {/* Parameters core */}
          {paramsObj ? (
            <JSONTree
              data={paramsObj}
              shouldExpandNodeInitially={(kp) => kp.length < 2}
              valueRenderer={valueRenderer}
              hideRoot
              invertTheme={isDark}
            />
          ) : (
            renderFallback()
          )}

          <div className="function-footer">)</div>
        </div>
      </div>
    </div>
  );
};

export default ToolCallMessage;
