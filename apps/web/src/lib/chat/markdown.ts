/**
 * Minimal message-content parsing shared by the chat renderer.
 *
 * Real provider replies are Markdown-ish. The most damaging part to leave
 * unrendered is fenced code — long lines force horizontal page scroll and the
 * fences themselves are noise — so this splits content into text and code
 * segments. Richer Markdown (headings, lists, emphasis) is deliberately not
 * parsed yet; see docs/ARCHITECTURE.md for the known gap.
 */

export type MessageSegment =
  | { kind: "text"; value: string }
  | { kind: "code"; language: string; value: string };

/**
 * Splits message text on ``` fences. An unterminated fence — which happens
 * mid-stream — renders as a code block rather than leaking raw backticks.
 */
export function parseSegments(input: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(input)) !== null) {
    if (match[0].length === 0) break; // defensive: never loop forever
    if (match.index > last) {
      segments.push({ kind: "text", value: input.slice(last, match.index) });
    }
    segments.push({
      kind: "code",
      language: match[1].trim(),
      value: match[2].replace(/\n$/, ""),
    });
    last = fence.lastIndex;
  }
  if (last < input.length) {
    segments.push({ kind: "text", value: input.slice(last) });
  }
  return segments;
}
