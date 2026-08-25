"use client";

import type { ProviderSelection } from "@uaw/types";
import type { MessageIntegration } from "@/lib/chat/types";
import { useCatalog } from "@/components/providers/catalog-context";

/**
 * Source badge on assistant messages (PRD §24), e.g. "Claude · Sonnet".
 * The pill labels how the reply was produced: "mock" for simulated replies,
 * "manual" for user-mediated ones; official-API replies carry no pill.
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
  const pill =
    integration === "manual" ? "manual" : integration === "mock" ? "mock" : null;

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
