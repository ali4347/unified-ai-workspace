import { describe, expect, it } from "vitest";
import type { UiChatMessage } from "@/lib/chat/types";
import {
  buildManualPackage,
  buildProviderContext,
  digestMessages,
  estimateTokens,
  MAX_SUMMARY_CHARS,
  rollingSummary,
} from "@/lib/chat/context";

let counter = 0;
function message(
  role: "user" | "assistant",
  content: string,
  status: UiChatMessage["status"] = "completed"
): UiChatMessage {
  counter += 1;
  return { id: `m${counter}`, role, content, status, createdAt: counter };
}

const smallHistory = [
  message("user", "Create the database architecture."),
  message("assistant", "Here is the schema…"),
];

// ~30 × 8000 chars ≈ 60k tokens — well over the 24k budget.
const largeHistory = Array.from({ length: 30 }, (_, i) =>
  message(i % 2 === 0 ? "user" : "assistant", `turn ${i} ` + "x".repeat(8_000))
);

describe("estimateTokens", () => {
  it("estimates chars/4 rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildProviderContext", () => {
  it("uses full history when it fits (Strategy A)", () => {
    const context = buildProviderContext({
      history: smallHistory,
      prompt: "Now create the auth flow.",
    });
    expect(context.strategy).toBe("full_history");
    expect(context.includedMessages).toBe(2);
    expect(context.messages.at(-1)).toEqual({
      role: "user",
      content: "Now create the auth flow.",
    });
    expect(context.summaryChars).toBe(0);
  });

  it("adds project instructions to the system prompt (Strategy D)", () => {
    const context = buildProviderContext({
      history: smallHistory,
      prompt: "hi",
      projectInstructions: "Always generate TypeScript.",
    });
    expect(context.system).toContain("Always generate TypeScript.");
  });

  it("falls back to summary + recent window when over budget (Strategy C)", () => {
    const context = buildProviderContext({
      history: largeHistory,
      prompt: "continue",
    });
    expect(context.strategy).toBe("summary_recent");
    expect(context.includedMessages).toBeGreaterThanOrEqual(2);
    expect(context.includedMessages).toBeLessThan(largeHistory.length);
    expect(context.summaryChars).toBeGreaterThan(0);
    expect(context.system).toContain("Summary of the earlier conversation");
  });

  it("excludes failed and empty messages", () => {
    const history = [
      ...smallHistory,
      message("assistant", "broken attempt", "failed"),
      message("assistant", ""),
    ];
    const context = buildProviderContext({ history, prompt: "next" });
    expect(context.includedMessages).toBe(2);
  });
});

describe("rollingSummary", () => {
  it("is empty while the conversation fits the budget", () => {
    expect(rollingSummary(smallHistory)).toBe("");
  });

  it("is deterministic and bounded for long conversations", () => {
    const first = rollingSummary(largeHistory);
    const second = rollingSummary(largeHistory);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS + 40);
  });
});

describe("digestMessages", () => {
  it("clips lines and labels roles", () => {
    const digest = digestMessages([
      message("user", "  a  question\nwith   whitespace  "),
    ]);
    expect(digest).toBe("- User: a question with whitespace");
  });
});

describe("buildManualPackage", () => {
  it("contains instructions, transcript and the new prompt", () => {
    const text = buildManualPackage({
      providerName: "Claude",
      history: smallHistory,
      prompt: "And now?",
      projectInstructions: "Use pnpm.",
    });
    expect(text).toContain("Use pnpm.");
    expect(text).toContain("User: Create the database architecture.");
    expect(text.trim().endsWith("User: And now?")).toBe(true);
  });
});
