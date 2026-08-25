"use client";

import { Check, ChevronDown, CircleUserRound, Plus } from "lucide-react";
import type { ProviderSelection } from "@uaw/types";
import { getAccount, getCatalogEntry } from "@/lib/providers/catalog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  usePopoverClose,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Provider account selector (PRD §16): the accounts of the active provider.
 * Mock sample accounts until Milestone 3 persistence; "connect account"
 * lights up with real connections (Milestone 6).
 */
export function AccountSelector({
  selection,
  onSelectAccount,
  disabled,
}: Readonly<{
  selection: ProviderSelection;
  onSelectAccount: (accountId: string) => void;
  disabled?: boolean;
}>) {
  const entry = getCatalogEntry(selection.providerSlug);
  const active = getAccount(selection.providerSlug, selection.accountId);

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        aria-label={`Select ${entry.meta.name} account`}
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CircleUserRound className="size-4 shrink-0" />
        <span className="hidden max-w-40 truncate sm:block">
          {active?.email ?? "No account"}
        </span>
        <ChevronDown className="size-4 shrink-0" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64">
        <div className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {entry.meta.name} accounts
        </div>
        {entry.accounts.map((accountInfo) => (
          <AccountRow
            key={accountInfo.id}
            email={accountInfo.email}
            status={accountInfo.status}
            active={accountInfo.id === selection.accountId}
            onSelect={() => onSelectAccount(accountInfo.id)}
          />
        ))}
        {entry.accounts.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No accounts yet
          </p>
        )}
        <div
          className="mt-1 flex cursor-not-allowed items-center gap-2 rounded-md border-t px-2 pb-1.5 pt-2 text-sm text-muted-foreground/60"
          title="Real account connections arrive with Milestone 6"
        >
          <Plus className="size-4" />
          Connect another account
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccountRow({
  email,
  status,
  active,
  onSelect,
}: Readonly<{
  email: string;
  status: string;
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
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status === "connected" ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
      />
      <span className="min-w-0 flex-1 truncate">{email}</span>
      {active && <Check className="size-4 shrink-0" />}
    </button>
  );
}
