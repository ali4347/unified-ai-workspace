import type { ProviderSlug } from "@uaw/types";

/**
 * Typed messaging protocol (PRD §28). Automation-type messages
 * (SEND_PROMPT, STOP_GENERATION, GET_MODELS) are part of the protocol shape
 * but the service worker answers them with UNSUPPORTED_ACTION: no provider
 * automation exists in this codebase (compliance policy, docs/SECURITY.md).
 */

export interface ProviderTabStatus {
  slug: ProviderSlug;
  name: string;
  tabCount: number;
}

/** Content script (provider tab) → service worker. */
export type DetectMessage = {
  type: "PROVIDER_PRESENT";
  provider: ProviderSlug;
};

/** Portal bridge / popup → service worker. */
export type PortalRequest =
  | { type: "GET_STATUS" }
  | { type: "CHECK_PROVIDER"; provider: ProviderSlug }
  | { type: "SEND_PROMPT" }
  | { type: "STOP_GENERATION" }
  | { type: "GET_MODELS" };

/** Service worker responses. */
export type PortalResponse =
  | { type: "PROVIDER_STATUS"; providers: ProviderTabStatus[] }
  | { type: "PROVIDER_ERROR"; code: "UNSUPPORTED_ACTION"; message: string };

export type ExtensionMessage = DetectMessage | PortalRequest;

/** window.postMessage envelope between the portal page and the bridge. */
export const PAGE_SOURCE = "uaw-portal";
export const EXTENSION_SOURCE = "uaw-extension";

export interface PageEnvelope {
  source: typeof PAGE_SOURCE;
  requestId: string;
  message: PortalRequest;
}

export interface ExtensionEnvelope {
  source: typeof EXTENSION_SOURCE;
  requestId?: string;
  message: PortalResponse | { type: "EXTENSION_READY"; version: string };
}
