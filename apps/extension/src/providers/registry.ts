import type { ProviderSlug } from "@uaw/types";

/**
 * Content-script provider registry + explicit domain allowlist (PRD §29).
 * MVP providers only — minimum host coverage. Adding a domain here requires
 * the compliance review in docs/PROVIDER_ADAPTERS.md.
 */
export const PROVIDER_DOMAINS: ReadonlyArray<{
  slug: ProviderSlug;
  name: string;
  host: string;
}> = [
  { slug: "claude", name: "Claude", host: "claude.ai" },
  { slug: "chatgpt", name: "ChatGPT", host: "chatgpt.com" },
];

export function providerForHost(
  host: string
): { slug: ProviderSlug; name: string } | undefined {
  const entry = PROVIDER_DOMAINS.find(
    (d) => host === d.host || host.endsWith(`.${d.host}`)
  );
  return entry ? { slug: entry.slug, name: entry.name } : undefined;
}

/** Portal origins allowed to talk to the extension (PRD §29 origin checks). */
export const PORTAL_ORIGINS: readonly string[] = [
  "https://unified-ai-workspace-web.vercel.app",
  "http://localhost:3000",
];
