import type { IntegrationMode } from "@uaw/types";
import { createClient } from "@/lib/supabase/server";
import { getCatalogData } from "@/lib/db/queries";
import {
  ProviderAccounts,
  type ConnectableProvider,
  type ProviderAccountItem,
} from "@/components/settings/provider-accounts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { ExtensionStatusCard } from "@/components/settings/extension-status";

export const metadata = {
  title: "Settings",
};

// Providers with a live official_api proxy route (kept in sync with
// lib/providers/registry.ts PROXY_ENDPOINTS).
const PROXIED_PROVIDERS = new Set(["claude", "chatgpt"]);

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const catalogData = await getCatalogData();
  const providerById = new Map(
    catalogData.providers.map((p) => [p.id, p] as const)
  );
  const connectableProviders: ConnectableProvider[] = catalogData.providers
    .filter((p) => p.status === "active")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      connectable: p.integration_type !== "disabled",
      hasProxy: PROXIED_PROVIDERS.has(p.slug),
    }));
  const accountItems: ProviderAccountItem[] = catalogData.accounts.flatMap(
    (a) => {
      const provider = providerById.get(a.provider_id);
      if (!provider) return [];
      const metadata =
        a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata)
          ? (a.metadata as { mode?: unknown })
          : {};
      return [
        {
          id: a.id,
          providerSlug: provider.slug,
          email: a.email ?? a.display_name ?? "Unnamed account",
          mode:
            metadata.mode === "manual" || metadata.mode === "official_api"
              ? (metadata.mode as IntegrationMode)
              : undefined,
        },
      ];
    }
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Your Unified AI Workspace account.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.email}</p>
            <p className="text-xs text-muted-foreground">
              Signed in via Supabase Auth
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI providers</CardTitle>
          <CardDescription>
            Connect provider accounts. Manual mode needs no credentials; API
            key mode keeps your key in this browser only — never on our
            servers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderAccounts
            providers={connectableProviders}
            accounts={accountItems}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser extension</CardTitle>
          <CardDescription>
            Optional companion that reports which provider tabs are open.
            Detection only — it never automates provider sites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExtensionStatusCard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Appearance settings for this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">Theme</p>
          <ThemeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
