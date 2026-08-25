import {
  EXTENSION_SOURCE,
  PAGE_SOURCE,
  type ExtensionEnvelope,
  type PageEnvelope,
  type PortalResponse,
} from "../messaging/protocol";
import { PORTAL_ORIGINS } from "../providers/registry";

/**
 * Portal bridge (Milestone 5): relays status queries between the Unified AI
 * Workspace page and the service worker via window.postMessage. Runs only on
 * allowlisted portal origins (manifest matches) and re-validates the origin
 * and message shape here (PRD §28–29).
 */

if (PORTAL_ORIGINS.includes(location.origin)) {
  const post = (envelope: ExtensionEnvelope) => {
    window.postMessage(envelope, location.origin);
  };

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const data = event.data as Partial<PageEnvelope> | null;
    if (!data || data.source !== PAGE_SOURCE || !data.message) return;
    if (typeof data.requestId !== "string") return;
    const requestId = data.requestId;

    try {
      void chrome.runtime
        .sendMessage(data.message)
        .then((response: PortalResponse | undefined) => {
          if (response) {
            post({ source: EXTENSION_SOURCE, requestId, message: response });
          }
        })
        .catch(() => undefined);
    } catch {
      // Extension context invalidated — the page treats missing replies
      // as "extension not available".
    }
  });

  post({
    source: EXTENSION_SOURCE,
    message: {
      type: "EXTENSION_READY",
      version: chrome.runtime.getManifest().version,
    },
  });
}
