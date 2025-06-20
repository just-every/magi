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
import { iconFromMessage } from "../utils/FormatUtils";

const theme = {
    base00: "#0c0d0e",
    base01: "#2e2f30",
    base02: "#515253",
    base03: "#737475",
    base04: "#959697",
    base05: "#b7b8b9",
    base06: "#dadbdc",
    base07: "#fcfdfe", // Function title
    base08: "#e31a1c",
    base09: "#ff8900", // Numbers
    base0A: "#dca060",
    base0B: "#00b9ff", // Strings
    base0C: "#80b1d3",
    base0D: "#c2c2c2", // Headings
    base0E: "#756bb1",
    base0F: "#b15928",
};

interface ToolCallMessageProps {
    message: ToolCallMessageType;
    complete: boolean;
    callFollows: boolean;
    colors?: {
        rgb: string;
        bgColor: string;
        textColor: string;
    };
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
const ToolCallMessage: FC<ToolCallMessageProps> = ({ message, complete, callFollows, colors }) => {
  // Memoised params
  const { obj: paramsObj, txt: paramsTxt } = useMemo(() => parseParams(message.toolParams), [message.toolParams]);

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
            theme={theme}
            shouldExpandNodeInitially={(kp) => kp.length < 6}
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
          <div className="message-title">
            {iconFromMessage(message, colors.rgb)} {titleify(message.toolName)} {complete ? "" : "Running…"}
          </div>
        </div>

        {/* Function‑call wrapper */}
        <div className="tool-call-block"
            style={{
                backgroundColor: theme.base00,
                color: theme.base07
            }}>
          <div className="function-header">{`${message.toolName}`}&nbsp;(</div>

            {/* Parameters core */}
            {paramsObj ? (
                <JSONTree
                data={paramsObj}
                shouldExpandNodeInitially={(kp) => kp.length < 6}
                valueRenderer={valueRenderer}
                hideRoot
                theme={theme}
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
