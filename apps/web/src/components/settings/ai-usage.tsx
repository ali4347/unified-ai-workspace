"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Cloud, KeyRound, Trash2 } from "lucide-react";
import type { ProviderSlug } from "@uaw/types";
import { connectAccount, disconnectAccount } from "@/lib/accounts/actions";
import { clearProviderKey, setProviderKey } from "@/lib/providers/key-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ApiConnection {
  id: string;
  providerSlug: ProviderSlug;
  label: string;
  /** Retired manual record — shown as legacy, cannot be used for new chats. */
  legacy?: boolean;
}

export interface UsageProvider {
  slug: ProviderSlug;
  /** Product name of the provider's developer API, e.g. "Anthropic API". */
  apiName: string;
  /** Models this deployment offers on the workspace plan. */
  workspaceModels: string[];
  /** The server has a credential configured for this provider. */
  workspaceReady: boolean;
}

/**
 * Settings → AI usage. Two ways to run a model:
 *
 *   Workspace Models   — provided by Unified AI Workspace, no key required.
 *   Bring Your Own API — the user's own OpenAI/Anthropic developer API key.
 *
 * These are developer API credentials. A consumer ChatGPT or Claude
 * subscription is a different product and is never used here.
 */
export function AiUsageSettings({
  providers,
  connections,
}: Readonly<{ providers: UsageProvider[]; connections: ApiConnection[] }>) {
  const anyWorkspace = providers.some((p) => p.workspaceReady);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Cloud className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Workspace Models</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Use models provided by Unified AI Workspace. No API key required.
        </p>

        {anyWorkspace ? (
          <ul className="space-y-1 pt-1">
            {providers
              .filter((p) => p.workspaceReady && p.workspaceModels.length > 0)
              .map((provider) => (
                <li
                  key={provider.slug}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <Check className="size-4 shrink-0 text-emerald-500" />
                  <span className="font-medium">{provider.apiName}</span>
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {provider.workspaceModels.join(", ")}
                  </span>
                  <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">
                    available
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed px-2.5 py-2 text-sm text-muted-foreground">
            Workspace models are temporarily unavailable. You can connect your
            own API below.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Bring Your Own API</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your own developer API key to use additional models and bill
          usage to your own provider account. Your API key is stored only in
          this browser and is used only for your requests.
        </p>

        {providers.map((provider) => (
          <ProviderConnections
            key={provider.slug}
            provider={provider}
            connections={connections.filter(
              (c) => c.providerSlug === provider.slug
            )}
          />
        ))}
      </section>
    </div>
  );
}

function ProviderConnections({
  provider,
  connections,
}: Readonly<{ provider: UsageProvider; connections: ApiConnection[] }>) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{provider.apiName}</p>
        {!open && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <KeyRound />
            Connect API
          </Button>
        )}
      </div>

      {connections.length === 0 && !open && (
        <p className="text-xs text-muted-foreground">Not connected.</p>
      )}

      <ul className="space-y-1">
        {connections.map((connection) => (
          <li
            key={connection.id}
            className="flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{connection.label}</span>
            <span className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">
              {connection.legacy ? "legacy" : "connected"}
            </span>
            <button
              type="button"
              aria-label={`Remove ${connection.label}`}
              className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={async () => {
                if (!window.confirm(`Remove ${connection.label}?`)) return;
                await disconnectAccount(connection.id);
                clearProviderKey(connection.providerSlug);
                router.refresh();
              }}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {connections.some((c) => c.legacy) && (
        <p className="text-xs text-muted-foreground">
          Legacy connections came from the retired copy-and-paste mode. Old
          messages still show, but new chats use Workspace or your own API.
        </p>
      )}

      {open && (
        <ConnectForm
          provider={provider}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
          onCancel={() => setOpen(false)}
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
  provider: UsageProvider;
  onDone: () => void;
  onCancel: () => void;
}>) {
  const fieldId = React.useId();
  const [label, setLabel] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = apiKey.trim();
      if (!key) {
        setError("Enter your API key.");
        return;
      }
      // The key is validated through our proxy, which forwards it to the
      // provider and never stores it.
      const response = await fetch(`/api/providers/${provider.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-key": key },
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
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
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
        <Label htmlFor={`${fieldId}-key`}>{provider.apiName} key</Label>
        <Input
          id={`${fieldId}-key`}
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Stored only in this browser and sent with your requests to{" "}
          {provider.apiName}. It is never saved on our servers.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void submit()}>
          {busy ? "Checking…" : "Connect"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
