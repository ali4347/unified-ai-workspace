"use client";

import type { ProviderSelection } from "@uaw/types";
import { useCatalog } from "@/components/providers/catalog-context";

/**
 * Source badge on assistant messages (PRD §24), e.g. "Claude · Sonnet".
 * Keeps mixed-provider Master Conversations readable; the "mock" tag is
 * honest labeling until real integrations (Milestone 6). Renders even if
 * the provider/model has since vanished from the catalog.
 */
export function ProviderBadge({
  selection,
}: Readonly<{ selection: ProviderSelection }>) {
  const catalog = useCatalog();
  const provider = catalog.find((e) => e.meta.slug === selection.providerSlug);
  const model = provider?.models.find((m) => m.id === selection.modelId);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {provider?.meta.name ?? selection.providerSlug}
      {model ? ` · ${model.name}` : ""}
      <span className="rounded-full border px-1.5 py-px text-[10px] font-normal">
        mock
      </span>
    </span>
  );
}
