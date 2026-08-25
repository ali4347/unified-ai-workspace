import type { ProviderSlug } from "@uaw/types";

/**
 * Browser-only storage for user-supplied provider API keys (`official_api`
 * mode, M6). Keys live in localStorage on the user's device and are sent
 * only as a per-request header to our same-origin proxy route, which
 * forwards them to the provider without storing or logging them
 * (PRD §19, docs/SECURITY.md). They are NEVER written to Supabase.
 */

const keyName = (slug: ProviderSlug): string => `uaw-provider-key-${slug}`;

export function getProviderKey(slug: ProviderSlug): string | null {
  try {
    return localStorage.getItem(keyName(slug));
  } catch {
    return null;
  }
}

export function setProviderKey(slug: ProviderSlug, key: string): void {
  try {
    localStorage.setItem(keyName(slug), key);
  } catch {
    // Storage unavailable — the key simply won't persist.
  }
}

export function clearProviderKey(slug: ProviderSlug): void {
  try {
    localStorage.removeItem(keyName(slug));
  } catch {
    // Ignore.
  }
}
