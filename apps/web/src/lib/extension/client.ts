import type { ProviderSlug } from "@uaw/types";

/**
 * Browser-side client for the companion extension's portal bridge
 * (apps/extension). Communicates via window.postMessage with origin +
 * envelope validation on both sides (PRD §28–29). Status queries only —
 * the extension performs no provider automation.
 */

const PAGE_SOURCE = "uaw-portal";
const EXTENSION_SOURCE = "uaw-extension";

export interface ExtensionProviderStatus {
  slug: ProviderSlug;
  name: string;
  tabCount: number;
}

export interface ExtensionStatus {
  available: boolean;
  providers: ExtensionProviderStatus[];
}

export function queryExtensionStatus(
  timeoutMs = 1500
): Promise<ExtensionStatus> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();

    const finish = (status: ExtensionStatus) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(status);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data as {
        source?: string;
        requestId?: string;
        message?: {
          type?: string;
          providers?: ExtensionProviderStatus[];
        };
      } | null;
      if (!data || data.source !== EXTENSION_SOURCE) return;
      if (data.requestId !== requestId) return;
      if (data.message?.type === "PROVIDER_STATUS") {
        finish({ available: true, providers: data.message.providers ?? [] });
      }
    };

    const timer = setTimeout(
      () => finish({ available: false, providers: [] }),
      timeoutMs
    );

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: PAGE_SOURCE, requestId, message: { type: "GET_STATUS" } },
      location.origin
    );
  });
}
