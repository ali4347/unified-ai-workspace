"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import type { IntegrationMode, ProviderSlug } from "@uaw/types";
import { connectAccount, disconnectAccount } from "@/lib/accounts/actions";
import {
  clearProviderKey,
  setProviderKey,
} from "@/lib/providers/key-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ProviderAccountItem {
  id: string;
  providerSlug: ProviderSlug;
  email: string;
  mode?: IntegrationMode;
}

export interface ConnectableProvider {
  slug: ProviderSlug;
  name: string;
  /** Product name of the developer API, e.g. "OpenAI API". Never a consumer
   * product name — this is not a ChatGPT or Claude subscription login. */
  apiName: string;
  /** One-line explanation shown under the heading. */
  blurb: string;
  /** A proxy route exists for this provider. */
  hasProxy: boolean;
}

/**
 * Settings → AI Providers (PRD §16, §37).
 *
 * Production has one connection mode: Bring Your Own API. The user supplies
 * their own OpenAI/Anthropic developer API key; it is validated through our
 * proxy and then stored ONLY in this browser's localStorage — never in the
 * database, never logged (PRD §19). The row we persist is metadata only.
 *
 * Retired `manual` records are listed as legacy so the user can remove them,
 * but they cannot be used for new conversations.
 */
export function ProviderAccounts({
  providers,
  accounts,
}: Readonly<{
  providers: ConnectableProvider[];
  accounts: ProviderAccountItem[];
}>) {
  const hasLegacy = accounts.some((a) => a.mode === "manual");
  return (
    <div className="space-y-5">
      {providers.map((provider) => (
        <ProviderSection
          key={provider.slug}
          provider={provider}
          accounts={accounts.filter((a) => a.providerSlug === provider.slug)}
        />
      ))}

      {hasLegacy && (
        <p className="text-xs text-muted-foreground">
          Connections marked <strong>legacy</strong> came from the retired
          copy-and-paste mode. Older messages still show, but new chats need an
          API key. You can remove them.
        </p>
      )}
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{provider.apiName}</p>
          <p className="text-sm text-muted-foreground">{provider.blurb}</p>
        </div>
        {provider.hasProxy ? (
          !connecting && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConnecting(true)}
            >
              <KeyRound />
              Connect API key
            </Button>
          )
        ) : (
          <span className="text-xs text-muted-foreground">Not available yet</span>
        )}
      </div>

      {accounts.length === 0 && !connecting && (
        <p className="text-xs text-muted-foreground">Not connected.</p>
      )}

      <ul className="space-y-1">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{account.email}</span>
            <span
              className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground"
              title={
                account.mode === "manual"
                  ? "Retired copy-and-paste connection — kept so older chats still show"
                  : undefined
              }
            >
              {account.mode === "manual" ? "legacy" : "connected"}
            </span>
            <button
              type="button"
              aria-label={`Disconnect ${account.email}`}
              className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  const [label, setLabel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fieldId = React.useId();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = apiKey.trim();
      if (!key) {
        setError("Enter your API key.");
        return;
      }
      // Validated through our proxy, which forwards it to the provider and
      // never stores it. Only after it is accepted do we keep it locally.
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
        setError(body?.message ?? "That key was not accepted.");
        return;
      }
      setProviderKey(provider.slug, key);

      const result = await connectAccount({
        providerSlug: provider.slug,
        email: label.trim() || `My ${provider.apiName}`,
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
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-label`}>Connection name</Label>
        <Input
          id={`${fieldId}-label`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`My ${provider.apiName}`}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-key`}>
          <span className="flex items-center gap-1.5">
            <KeyRound className="size-3.5" />
            {provider.apiName} key
          </span>
        </Label>
        <Input
          id={`${fieldId}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Your API key is stored only in this browser and is used only for your
          requests.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

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

