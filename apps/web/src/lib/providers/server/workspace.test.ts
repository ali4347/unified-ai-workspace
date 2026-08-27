import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  WORKSPACE_DAILY_REQUEST_LIMIT,
  isWorkspaceConfigured,
  workspaceApiKey,
} from "@/lib/providers/server/workspace";

/**
 * Workspace credentials are the app owner's money and the app owner's secret,
 * so these tests pin the two properties that matter: the key is read from a
 * server-only variable, and "not configured" is reported rather than guessed.
 */

const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("workspaceApiKey", () => {
  it("reads the server-only variable for each provider", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    expect(workspaceApiKey("claude")).toBe("sk-ant-test");
    expect(workspaceApiKey("chatgpt")).toBe("sk-openai-test");
  });

  it("reports unconfigured rather than returning an empty credential", () => {
    expect(workspaceApiKey("claude")).toBeNull();
    expect(isWorkspaceConfigured("claude")).toBe(false);

    process.env.ANTHROPIC_API_KEY = "   ";
    expect(workspaceApiKey("claude")).toBeNull();
    expect(isWorkspaceConfigured("claude")).toBe(false);

    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(isWorkspaceConfigured("claude")).toBe(true);
  });

  it("never reads a NEXT_PUBLIC_ variable — those ship to the browser", () => {
    process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY = "leaked-to-browser";
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = "leaked-to-browser";
    try {
      expect(workspaceApiKey("claude")).toBeNull();
      expect(workspaceApiKey("chatgpt")).toBeNull();
    } finally {
      delete process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
      delete process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    }
  });
});

describe("workspace daily limit", () => {
  it("is a positive number so workspace spend is always bounded", () => {
    expect(WORKSPACE_DAILY_REQUEST_LIMIT).toBeGreaterThan(0);
    expect(Number.isFinite(WORKSPACE_DAILY_REQUEST_LIMIT)).toBe(true);
  });
});
