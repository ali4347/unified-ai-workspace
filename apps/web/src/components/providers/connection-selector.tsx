"use client";

import Link from "next/link";
import { Check, ChevronDown, Cloud, KeyRound, Plus } from "lucide-react";
import type { ModelInfo, ProviderSelection } from "@uaw/types";
import { getEntry, selectableAccounts } from "@/lib/providers/catalog";
import { useCatalog } from "@/components/providers/catalog-context";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopoverClose,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Connection selector (PRD §16): how the selected model is reached.
 *
 *   Workspace — models provided by Unified AI Workspace, no key required.
 *               Represented by `accountId === null`.
 *   Your APIs — the user's own OpenAI/Anthropic API connections.
 *
 * Workspace is hidden for models the owner has not made available on the
 * workspace plan, so the selector never offers a combination the server would
 * refuse.
 */
export function ConnectionSelector({
  selection,
  model,
  onSelectConnection,
  disabled,
}: Readonly<{
  selection: ProviderSelection;
  model?: ModelInfo;
  onSelectConnection: (accountId: string | null) => void;
  disabled?: boolean;
}>) {
  const catalog = useCatalog();
  const entry = getEntry(catalog, selection.providerSlug);
  const accounts = selectableAccounts(catalog, selection.providerSlug);
  const active = accounts.find((a) => a.id === selection.accountId);
  const availability = model?.availability ?? "both";
  const workspaceAllowed = availability === "workspace" || availability === "both";

  return (
    <Popover className="min-w-0">
      <PopoverTrigger
        disabled={disabled}
        aria-label="Change how this model is reached"
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {active ? (
          <KeyRound className="size-4 shrink-0" />
        ) : (
          <Cloud className="size-4 shrink-0" />
        )}
        <span className="hidden max-w-40 truncate sm:block">
          {active ? active.email : "Workspace"}
        </span>
        <ChevronDown className="size-4 shrink-0" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1.5rem)]">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {entry.meta.name} connection
        </div>

        {workspaceAllowed ? (
          <ConnectionRow
            icon={<Cloud className="size-4 shrink-0" />}
            title="Workspace"
            subtitle="Provided by Unified AI Workspace — no API key required"
            active={selection.accountId === null}
            onSelect={() => onSelectConnection(null)}
          />
        ) : (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            This model needs your own API key.
          </p>
        )}

        {accounts.map((account) => (
          <ConnectionRow
            key={account.id}
            icon={<KeyRound className="size-4 shrink-0" />}
            title={account.email}
            subtitle={`Your ${entry.meta.name === "Claude" ? "Anthropic" : "OpenAI"} API`}
            active={account.id === selection.accountId}
            onSelect={() => onSelectConnection(account.id)}
          />
        ))}

        <Link
          href="/settings"
          className="mt-1 flex items-center gap-2 rounded-md border-t px-2 pb-1.5 pt-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-4" />
          Connect your own API
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function ConnectionRow({
  icon,
  title,
  subtitle,
  active,
  onSelect,
}: Readonly<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  onSelect: () => void;
}>) {
  const close = usePopoverClose();

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect();
        close();
      }}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent/50"
      )}
    >
      <span className="pt-0.5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {active && <Check className="size-4 shrink-0" />}
      {active && <span className="sr-only">selected</span>}
    </button>
  );
}
