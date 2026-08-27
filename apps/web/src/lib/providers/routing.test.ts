import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderMessageRequest } from "@uaw/provider-core";
import { isProviderError } from "@uaw/provider-core";
import type { ProviderAccountInfo } from "@uaw/types";

/**
 * Production has exactly one execution mode: Bring Your Own API.
 *
 * These tests pin the refusals, because the dangerous failure here is a
 * *silent* one — a fabricated reply that reads like a real provider answer, or
 * a keyless request quietly answered by some other path. Every unsupported
 * case must raise, not improvise.
 */

// localStorage is not present in the node test environment. Re-stubbed in
// beforeEach because vi.unstubAllGlobals() (used to drop fetch stubs) would
// otherwise remove it too.
const store = new Map<string, string>();
const stubLocalStorage = () =>
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
stubLocalStorage();

const { createRegistryFromCatalog } = await import(
  "@/lib/providers/registry"
);
const { FALLBACK_CATALOG } = await import("@/lib/providers/catalog");
const { setProviderKey, clearProviderKey } = await import(
  "@/lib/providers/key-store"
);

const registry = createRegistryFromCatalog(FALLBACK_CATALOG);

const byokAccount: ProviderAccountInfo = {
  id: "acc-byok",
  providerSlug: "claude",
  email: "my-anthropic-api",
  status: "connected",
  integrationMode: "official_api",
  legacy: false,
};

const manualAccount: ProviderAccountInfo = {
  id: "acc-manual",
  providerSlug: "claude",
  email: "old-manual",
  status: "connected",
  integrationMode: "manual",
  legacy: true,
};

function request(
  account?: ProviderAccountInfo,
  slug: "claude" | "chatgpt" = "claude"
): ProviderMessageRequest {
  const model =
    slug === "claude"
      ? { id: "claude-sonnet", providerSlug: slug, name: "Sonnet" }
      : { id: "chatgpt-mini", providerSlug: slug, name: "GPT mini" };
  return {
    messages: [{ role: "user", content: "hello" }],
    model,
    account,
  };
}

async function expectRefusal(promise: Promise<unknown>, match: RegExp) {
  await expect(promise).rejects.toThrow(match);
  await promise.catch((error) => {
    // Refusals must be normalized provider errors, not raw exceptions.
    expect(isProviderError(error)).toBe(true);
    expect(error.code).toBe("UNSUPPORTED_ACTION");
  });
}

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  stubLocalStorage();
});

describe("no connection", () => {
  it("is refused and never answered with a simulated reply", async () => {
    const adapter = registry.getAdapter("claude");
    const promise = adapter.sendMessage(request(undefined));
    await expectRefusal(promise, /Connect your Claude API key/i);
    // The mock adapter's reply text must never surface in production.
    await promise.catch((error) => {
      expect(String(error.message)).not.toMatch(/mock|simulated/i);
    });
  });
});

describe("retired manual connections", () => {
  it("cannot execute a new turn", async () => {
    const adapter = registry.getAdapter("claude");
    await expectRefusal(
      adapter.sendMessage(request(manualAccount)),
      /retired copy-and-paste mode/i
    );
  });

  it("is refused even if the legacy flag is missing but the mode is manual", async () => {
    const adapter = registry.getAdapter("claude");
    await expectRefusal(
      adapter.sendMessage(
        request({ ...manualAccount, legacy: undefined })
      ),
      /retired copy-and-paste mode/i
    );
  });
});

describe("BYOK without a key in this browser", () => {
  it("fails loudly instead of falling through to another mode", async () => {
    clearProviderKey("claude");
    const adapter = registry.getAdapter("claude");
    await expect(
      adapter.sendMessage(request(byokAccount))
    ).rejects.toThrow(/API key/i);

    await adapter.sendMessage(request(byokAccount)).catch((error) => {
      expect(isProviderError(error)).toBe(true);
      // LOGIN_REQUIRED, i.e. "connect a key" — never a silent success.
      expect(error.code).toBe("LOGIN_REQUIRED");
    });
  });
});

describe("BYOK with a key", () => {
  it("sends to the same-origin proxy with the key as a header, for both providers", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          headers: init.headers as Record<string, string>,
        });
        return new Response("streamed reply", { status: 200 });
      })
    );

    setProviderKey("claude", "sk-ant-test");
    setProviderKey("chatgpt", "sk-openai-test");

    const claude = await registry
      .getAdapter("claude")
      .sendMessage(request(byokAccount, "claude"));
    expect(claude.status).toBe("completed");
    expect(claude.content).toBe("streamed reply");

    const openai = await registry.getAdapter("chatgpt").sendMessage(
      request(
        { ...byokAccount, id: "acc-openai", providerSlug: "chatgpt" },
        "chatgpt"
      )
    );
    expect(openai.status).toBe("completed");

    expect(calls.map((c) => c.url)).toEqual([
      "/api/providers/claude",
      "/api/providers/chatgpt",
    ]);
    // Same-origin relative paths only, and the key travels as a header —
    // never in the URL or query string.
    for (const call of calls) {
      expect(call.url.startsWith("/api/")).toBe(true);
      expect(call.url).not.toMatch(/sk-/);
    }
    expect(calls[0].headers["x-provider-key"]).toBe("sk-ant-test");
    expect(calls[1].headers["x-provider-key"]).toBe("sk-openai-test");
  });

  it("surfaces an invalid key as a normalized provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: "LOGIN_REQUIRED",
              message: "Invalid Anthropic API key",
            }),
            { status: 401 }
          )
      )
    );
    setProviderKey("claude", "sk-bad");

    await registry
      .getAdapter("claude")
      .sendMessage(request(byokAccount))
      .catch((error) => {
        expect(isProviderError(error)).toBe(true);
        expect(error.code).toBe("LOGIN_REQUIRED");
        expect(error.message).toBe("Invalid Anthropic API key");
      });
  });
});
