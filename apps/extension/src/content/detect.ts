import { providerForHost } from "../providers/registry";
import type { DetectMessage } from "../messaging/protocol";

/**
 * Provider-tab detection (Milestone 5). PASSIVE ONLY: announces that a
 * provider site is open in this tab. It never reads page content, cookies
 * or credentials, and never interacts with the page (PRD §27, §29;
 * docs/SECURITY.md).
 */
const provider = providerForHost(location.host);

if (provider) {
  const announce = () => {
    const message: DetectMessage = {
      type: "PROVIDER_PRESENT",
      provider: provider.slug,
    };
    try {
      void chrome.runtime.sendMessage(message);
    } catch {
      // Extension context invalidated (e.g. update) — nothing to do.
    }
  };

  announce();
  // Re-announce when the tab becomes visible again: covers service-worker
  // restarts that lose the in-memory tab map.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") announce();
  });
}
