import { describe, expect, it } from "vitest";
import { parseSegments } from "@/lib/chat/markdown";

describe("parseSegments", () => {
  it("returns a single text segment when there is no fence", () => {
    expect(parseSegments("just a reply")).toEqual([
      { kind: "text", value: "just a reply" },
    ]);
  });

  it("returns nothing for empty content", () => {
    expect(parseSegments("")).toEqual([]);
  });

  it("splits text around a fenced block and keeps the language", () => {
    const segments = parseSegments("before\n```ts\nconst a = 1;\n```\nafter");
    expect(segments).toEqual([
      { kind: "text", value: "before\n" },
      { kind: "code", language: "ts", value: "const a = 1;" },
      { kind: "text", value: "\nafter" },
    ]);
  });

  it("handles a fence with no language", () => {
    const segments = parseSegments("```\nplain\n```");
    expect(segments).toEqual([{ kind: "code", language: "", value: "plain" }]);
  });

  it("handles multiple fenced blocks", () => {
    const segments = parseSegments("```sh\na\n```\nmid\n```py\nb\n```");
    expect(segments.filter((s) => s.kind === "code")).toEqual([
      { kind: "code", language: "sh", value: "a" },
      { kind: "code", language: "py", value: "b" },
    ]);
  });

  it("treats an unterminated fence as code (streaming mid-reply)", () => {
    const segments = parseSegments("intro\n```ts\nconst partial =");
    expect(segments).toEqual([
      { kind: "text", value: "intro\n" },
      { kind: "code", language: "ts", value: "const partial =" },
    ]);
  });

  it("preserves inner blank lines and indentation", () => {
    const code = "def f():\n\n    return 1";
    const segments = parseSegments("```python\n" + code + "\n```");
    expect(segments[0]).toEqual({
      kind: "code",
      language: "python",
      value: code,
    });
  });

  it("round-trips content that contains no fences unchanged", () => {
    const text = "backticks `inline` stay in the text segment";
    expect(parseSegments(text)).toEqual([{ kind: "text", value: text }]);
  });

  it("terminates on pathological input", () => {
    const segments = parseSegments("```".repeat(50));
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.kind === "code" || s.kind === "text")).toBe(
      true
    );
  });
});
