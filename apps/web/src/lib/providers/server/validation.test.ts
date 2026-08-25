import { describe, expect, it } from "vitest";
import {
  checkRateLimit,
  MAX_MESSAGES,
  MAX_TOTAL_CHARS,
  readProviderKey,
  validateChatBody,
} from "@/lib/providers/server/validation";

describe("validateChatBody", () => {
  const valid = {
    model: "claude-sonnet",
    messages: [{ role: "user" as const, content: "hi" }],
  };

  it("accepts a minimal valid body", () => {
    expect(validateChatBody(valid)).toBeNull();
  });

  it("rejects a missing model or empty messages", () => {
    expect(validateChatBody({ ...valid, model: undefined })).toBe(
      "model required"
    );
    expect(validateChatBody({ ...valid, messages: [] })).toBe(
      "messages required"
    );
  });

  it("rejects too many messages", () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => ({
      role: "user" as const,
      content: "x",
    }));
    expect(validateChatBody({ ...valid, messages })).toBe("too many messages");
  });

  it("rejects invalid roles and oversized context", () => {
    expect(
      validateChatBody({
        ...valid,
        messages: [{ role: "system" as never, content: "x" }],
      })
    ).toBe("invalid message role");
    expect(
      validateChatBody({
        ...valid,
        messages: [
          { role: "user", content: "x".repeat(MAX_TOTAL_CHARS + 1) },
        ],
      })
    ).toBe("context too large");
  });
});

describe("readProviderKey", () => {
  it("reads the header and rejects oversized keys", () => {
    const request = new Request("http://x", {
      headers: { "x-provider-key": "sk-test" },
    });
    expect(readProviderKey(request)).toBe("sk-test");

    const oversized = new Request("http://x", {
      headers: { "x-provider-key": "k".repeat(600) },
    });
    expect(readProviderKey(oversized)).toBeNull();
    expect(readProviderKey(new Request("http://x"))).toBeNull();
  });
});

describe("checkRateLimit", () => {
  it("allows up to the window limit, then blocks, then recovers", () => {
    const user = `user-${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i += 1) {
      expect(checkRateLimit(user, t0 + i)).toBe(true);
    }
    expect(checkRateLimit(user, t0 + 30_000)).toBe(false);
    expect(checkRateLimit(user, t0 + 61_000)).toBe(true);
  });
});
