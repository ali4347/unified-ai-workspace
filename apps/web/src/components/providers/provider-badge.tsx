"use client";

import type { ProviderSelection } from "@uaw/types";
import type { MessageIntegration } from "@/lib/chat/types";
import { useCatalog } from "@/components/providers/catalog-context";

/**
 * Source badge on assistant messages (PRD §24), e.g. "Claude · Sonnet".
 * The pill says how the reply was produced. Workspace replies carry no pill
 * (that is the default path); "your API" marks a Bring-Your-Own-API reply.
 * "manual" and "mock" appear only on historical messages and still render.
 * Renders even if the provider/model has since vanished from the catalog.
 */
export function ProviderBadge({
  selection,
  integration,
}: Readonly<{
  selection: ProviderSelection;
  integration?: MessageIntegration;
}>) {
  const catalog = useCatalog();
  const provider = catalog.find((e) => e.meta.slug === selection.providerSlug);
  const model = provider?.models.find((m) => m.id === selection.modelId);
  // Live modes: workspace shows no pill (it is the default), BYOK shows
  // whose key paid for it. Historical values keep rendering for old messages.
  const pill =
    integration === "byok"
      ? "your API"
      : integration === "official_api"
        ? "your API"
        : integration === "manual"
          ? "manual"
          : integration === "mock"
            ? "mock"
            : null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {provider?.meta.name ?? selection.providerSlug}
      {model ? ` · ${model.name}` : ""}
      {pill && (
        <span className="rounded-full border px-1.5 py-px text-[10px] font-normal">
          {pill}
        </span>
      )}
    </span>
  );
}
