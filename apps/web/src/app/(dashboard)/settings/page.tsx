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

// Providers with a live proxy route (kept in sync with the PROXY_ENDPOINTS
// map in lib/providers/registry.ts). These are DEVELOPER APIs — never a
// consumer ChatGPT/Claude subscription.
const PROVIDER_API = {
  chatgpt: {
    apiName: "OpenAI API",
    blurb: "Connect your OpenAI API key to use OpenAI models.",
  },
  claude: {
    apiName: "Anthropic API",
    blurb: "Connect your Anthropic API key to use Claude models.",
  },
} as const;

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
    .map((p) => {
      const api = PROVIDER_API[p.slug as keyof typeof PROVIDER_API];
      return {
        slug: p.slug,
        name: p.name,
        apiName: api?.apiName ?? `${p.name} API`,
        blurb: api?.blurb ?? `Connect your ${p.name} API key.`,
        hasProxy: api !== undefined,
      };
    });
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
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            Bring your own developer API key to chat. Your API key is stored
            only in this browser and is used only for your requests. Your
            Unified AI Workspace sign-in is separate from any provider account.
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
