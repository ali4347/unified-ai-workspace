import type { PortalResponse } from "../messaging/protocol";

/** Popup: shows which provider tabs are currently open. */

function render(html: string): void {
  const root = document.getElementById("root");
  if (root) root.innerHTML = html;
}

async function load(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: "GET_STATUS",
    })) as PortalResponse | undefined;

    if (!response || response.type !== "PROVIDER_STATUS") {
      render("<p>Status unavailable.</p>");
      return;
    }

    const rows = response.providers
      .map(
        (p) =>
          `<li><span class="dot ${p.tabCount > 0 ? "on" : "off"}"></span>` +
          `${p.name} — ${p.tabCount > 0 ? `${p.tabCount} tab${p.tabCount > 1 ? "s" : ""} open` : "no tab open"}</li>`
      )
      .join("");
    render(`<ul>${rows}</ul><p class="note">Detection only — this extension never automates provider sites.</p>`);
  } catch {
    render("<p>Status unavailable.</p>");
  }
}

void load();
