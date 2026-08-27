"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseSegments } from "@/lib/chat/markdown";

/**
 * Renders assistant/user message text (parsing lives in lib/chat/markdown).
 *
 * Real provider replies are Markdown-ish, and the most damaging part to leave
 * unrendered is fenced code — long lines force horizontal page scroll and the
 * fences themselves are noise. So this handles fenced blocks and inline code
 * and leaves the rest as pre-wrapped text. Everything is rendered as React
 * children (never dangerouslySetInnerHTML), so provider output cannot inject
 * markup. Richer Markdown (headings, lists, emphasis) is deliberately not
 * rendered yet — see supabase/tests/README.md and docs for the known gap.
 */

/** Renders `inline code` spans inside a plain-text run. */
function InlineText({ value }: Readonly<{ value: string }>) {
  const parts = value.split(/(`[^`\n]+`)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code
            key={i}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </span>
  );
}

function CodeBlock({
  language,
  value,
}: Readonly<{ language: string; value: string }>) {
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/60 px-2.5 py-1">
        <span className="font-mono text-xs text-muted-foreground">
          {language || "code"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
          aria-label={`Copy ${language || "code"} block`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard unavailable — the text stays selectable.
            }
          }}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {/* Wide code scrolls inside its own box, never the page. */}
      <pre className="overflow-x-auto p-2.5 text-xs leading-relaxed">
        <code className="font-mono">{value}</code>
      </pre>
    </div>
  );
}

export function MessageContent({ content }: Readonly<{ content: string }>) {
  const segments = React.useMemo(() => parseSegments(content), [content]);

  return (
    <div className="text-sm leading-relaxed">
      {segments.map((segment, i) =>
        segment.kind === "code" ? (
          <CodeBlock key={i} language={segment.language} value={segment.value} />
        ) : (
          <InlineText key={i} value={segment.value} />
        )
      )}
    </div>
  );
}
