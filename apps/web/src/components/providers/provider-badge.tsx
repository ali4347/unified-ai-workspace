import type { ProviderSelection } from "@uaw/types";
import { getCatalogEntry, getModel } from "@/lib/providers/catalog";

/**
 * Source badge on assistant messages (PRD §24), e.g. "Claude · Sonnet".
 * Keeps mixed-provider Master Conversations readable; the "mock" tag is
 * honest labeling until real integrations (Milestone 6).
 */
export function ProviderBadge({
  selection,
}: Readonly<{ selection: ProviderSelection }>) {
  const provider = getCatalogEntry(selection.providerSlug).meta;
  const model = getModel(selection.providerSlug, selection.modelId);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {provider.name} · {model.name}
      <span className="rounded-full border px-1.5 py-px text-[10px] font-normal">
        mock
      </span>
    </span>
  );
}
