"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2, UserRoundPlus } from "lucide-react";
import type { IntegrationMode, ProviderSlug } from "@uaw/types";
import { connectAccount, disconnectAccount } from "@/lib/accounts/actions";
import {
  clearProviderKey,
  setProviderKey,
} from "@/lib/providers/key-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ProviderAccountItem {
  id: string;
  providerSlug: ProviderSlug;
  email: string;
  mode?: IntegrationMode;
}

export interface ConnectableProvider {
  slug: ProviderSlug;
  name: string;
  /** integration_type !== "disabled" — the compliance gate has approved a mode. */
  connectable: boolean;
  /** A proxy route exists, so official_api mode is offered. */
  hasProxy: boolean;
}

/**
 * Connected accounts management (PRD §16, §37; M6). Manual mode stores
 * metadata only. API-key mode: the key is validated through our proxy and
 * then stored ONLY in this browser's localStorage — never in the database
 * (PRD §19).
 */
export function ProviderAccounts({
  providers,
  accounts,
}: Readonly<{
  providers: ConnectableProvider[];
  accounts: ProviderAccountItem[];
}>) {
  return (
    <div className="space-y-5">
      {providers.map((provider) => (
        <ProviderSection
          key={provider.slug}
          provider={provider}
          accounts={accounts.filter((a) => a.providerSlug === provider.slug)}
        />
      ))}
    </div>
  );
}

function ProviderSection({
  provider,
  accounts,
}: Readonly<{
  provider: ConnectableProvider;
  accounts: ProviderAccountItem[];
}>) {
  const router = useRouter();
  const [connecting, setConnecting] = React.useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{provider.name}</p>
        {provider.connectable ? (
          !connecting && (
            <Button variant="outline" size="sm" onClick={() => setConnecting(true)}>
              <UserRoundPlus />
              Connect
            </Button>
          )
        ) : (
          <span className="text-xs text-muted-foreground">
            No approved integration mode yet
          </span>
        )}
      </div>

      {accounts.length === 0 && !connecting && (
        <p className="text-xs text-muted-foreground">
          No accounts connected. Connect one to start chatting with this provider.
        </p>
      )}

      <ul className="space-y-1">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{account.email}</span>
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">
              {account.mode === "official_api" ? "API key" : "manual"}
            </span>
            <button
              type="button"
              aria-label={`Disconnect ${account.email}`}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (!window.confirm(`Disconnect ${account.email}?`)) return;
                await disconnectAccount(account.id);
                if (account.mode === "official_api") {
                  clearProviderKey(account.providerSlug);
                }
                router.refresh();
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {connecting && (
        <ConnectForm
          provider={provider}
          onDone={() => {
            setConnecting(false);
            router.refresh();
          }}
          onCancel={() => setConnecting(false)}
        />
      )}
    </div>
  );
}

function ConnectForm({
  provider,
  onDone,
  onCancel,
}: Readonly<{
  provider: ConnectableProvider;
  onDone: () => void;
  onCancel: () => void;
}>) {
  const [mode, setMode] = React.useState<IntegrationMode>("manual");
  const [label, setLabel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "official_api") {
        const key = apiKey.trim();
        if (!key) {
          setError("API key required");
          return;
        }
        const response = await fetch(`/api/providers/${provider.slug}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-provider-key": key,
          },
          body: JSON.stringify({ action: "validate" }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          setError(body?.message ?? "Key validation failed");
          return;
        }
        setProviderKey(provider.slug, key);
      }

      const result = await connectAccount({
        providerSlug: provider.slug,
        mode,
        email: label,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex gap-2">
        <ModeButton
          active={mode === "manual"}
          onClick={() => setMode("manual")}
          title="Manual"
          description="You paste prompts into the provider yourself — no credentials anywhere."
        />
        {provider.hasProxy && (
          <ModeButton
            active={mode === "official_api"}
            onClick={() => setMode("official_api")}
            title="Your API key"
            description="Automatic replies via the official API. Key stays in this browser only."
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${provider.slug}-label`}>Account label</Label>
        <Input
          id={`${provider.slug}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`e.g. ali@gmail.com (${provider.name} account)`}
        />
      </div>

      {mode === "official_api" && (
        <div className="space-y-1.5">
          <Label htmlFor={`${provider.slug}-key`}>
            <span className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              {provider.name} API key
            </span>
          </Label>
          <Input
            id={`${provider.slug}-key`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Stored only in this browser (localStorage) and sent per request to
            the official API through this app — never saved on our servers.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void submit()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  description,
}: Readonly<{
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 rounded-lg border p-2.5 text-left transition-colors",
        active ? "border-ring bg-accent/50" : "hover:bg-accent/30"
      )}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block pt-0.5 text-xs text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
