import type { ProviderSlug } from "@uaw/types";
import type {
  ExtensionMessage,
  PortalResponse,
  ProviderTabStatus,
} from "../messaging/protocol";
import { PORTAL_ORIGINS, PROVIDER_DOMAINS } from "../providers/registry";

/**
 * Service worker (Milestone 5): tracks which provider tabs are open and
 * answers status queries from the portal bridge and the popup. It rejects
 * unknown origins and refuses automation-type messages (PRD §27–29;
 * docs/SECURITY.md compliance policy).
 */

/** tabId → provider slug. In-memory; MV3 may evict the worker, in which case
 * tabs re-announce on their next detect ping. */
const providerTabs = new Map<number, ProviderSlug>();

function statusList(): ProviderTabStatus[] {
  const counts = new Map<ProviderSlug, number>();
  for (const slug of providerTabs.values()) {
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return PROVIDER_DOMAINS.map((d) => ({
    slug: d.slug,
    name: d.name,
    tabCount: counts.get(d.slug) ?? 0,
  }));
}

function isAllowedSender(sender: chrome.runtime.MessageSender): boolean {
  // Only our own extension's contexts (content scripts, popup).
  if (sender.id !== chrome.runtime.id) return false;
  // Content scripts additionally carry the page origin — validate it.
  if (sender.url) {
    try {
      const origin = new URL(sender.url).origin;
      const host = new URL(sender.url).host;
      const providerHost = PROVIDER_DOMAINS.some(
        (d) => host === d.host || host.endsWith(`.${d.host}`)
      );
      const portal = PORTAL_ORIGINS.includes(origin);
      const extensionPage = origin === `chrome-extension://${chrome.runtime.id}`;
      return providerHost || portal || extensionPage;
    } catch {
      return false;
    }
  }
  return true; // extension pages (popup) may omit url
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: PortalResponse) => void
  ): boolean | undefined => {
    if (!isAllowedSender(sender)) return undefined;

    switch (message.type) {
      case "PROVIDER_PRESENT": {
        if (sender.tab?.id !== undefined) {
          providerTabs.set(sender.tab.id, message.provider);
        }
        return undefined;
      }
      case "GET_STATUS": {
        sendResponse({ type: "PROVIDER_STATUS", providers: statusList() });
        return undefined;
      }
      case "CHECK_PROVIDER": {
        sendResponse({
          type: "PROVIDER_STATUS",
          providers: statusList().filter((p) => p.slug === message.provider),
        });
        return undefined;
      }
      case "SEND_PROMPT":
      case "STOP_GENERATION":
      case "GET_MODELS": {
        sendResponse({
          type: "PROVIDER_ERROR",
          code: "UNSUPPORTED_ACTION",
          message:
            "Provider automation is not implemented. Compliant integration modes only (docs/SECURITY.md).",
        });
        return undefined;
      }
      default:
        return undefined;
    }
  }
);

chrome.tabs.onRemoved.addListener((tabId: number) => {
  providerTabs.delete(tabId);
});
