"use client";

import { Check, ChevronDown } from "lucide-react";
import type { ModelInfo, ProviderSelection } from "@uaw/types";
import { getModel, PROVIDER_CATALOG } from "@/lib/providers/catalog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopoverClose,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Top AI selector (PRD §15): models grouped by provider, sourced from the
 * catalog — never hard-coded here. Phase 2 providers are visible but
 * unselectable; MVP providers run on mock data until Milestone 6.
 */
export function AiSelector({
  selection,
  onSelect,
  disabled,
}: Readonly<{
  selection: ProviderSelection;
  onSelect: (model: ModelInfo) => void;
  disabled?: boolean;
}>) {
  const activeProvider = PROVIDER_CATALOG.find(
    (entry) => entry.meta.slug === selection.providerSlug
  );
  const activeModel = getModel(selection.providerSlug, selection.modelId);

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label="Select AI provider and model"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {activeProvider?.meta.name}{" "}
          <span className="text-muted-foreground">{activeModel.name}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent className="max-h-96 w-72 overflow-y-auto">
        {PROVIDER_CATALOG.map((entry) => (
          <div key={entry.meta.slug} className="py-1">
            <div className="flex items-center gap-2 px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.meta.name}
              <span className="rounded-full border px-1.5 py-px text-[10px] font-normal normal-case">
                {entry.enabled ? "Mock" : "Phase 2"}
              </span>
            </div>
            {entry.models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                enabled={entry.enabled}
                active={
                  selection.providerSlug === model.providerSlug &&
                  selection.modelId === model.id
                }
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ModelRow({
  model,
  enabled,
  active,
  onSelect,
}: Readonly<{
  model: ModelInfo;
  enabled: boolean;
  active: boolean;
  onSelect: (model: ModelInfo) => void;
}>) {
  const close = usePopoverClose();

  return (
    <button
      type="button"
      role="menuitem"
      disabled={!enabled}
      onClick={() => {
        onSelect(model);
        close();
      }}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        enabled
          ? "hover:bg-accent hover:text-accent-foreground"
          : "cursor-not-allowed text-muted-foreground/60"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate">{model.name}</span>
        {model.description && (
          <span className="block truncate text-xs text-muted-foreground">
            {model.description}
          </span>
        )}
      </span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  );
}
