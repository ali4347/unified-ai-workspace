import type { ProviderSlug } from "@uaw/types";
import { createClient } from "@/lib/supabase/server";
import { getCatalogData } from "@/lib/db/queries";
import { buildCatalog } from "@/lib/providers/catalog";
import { isWorkspaceConfigured } from "@/lib/providers/server/workspace";
import {
  AiUsageSettings,
  type ApiConnection,
  type UsageProvider,
} from "@/components/settings/ai-usage";
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

// Product names of the developer APIs behind each provider. These are API
// products, not consumer ChatGPT/Claude subscriptions.
const API_NAME: Partial<Record<ProviderSlug, string>> = {
  claude: "Anthropic API",
  chatgpt: "OpenAI API",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const catalogData = await getCatalogData();
  const catalog = buildCatalog(catalogData);

  const providers: UsageProvider[] = catalog
    .filter((entry) => entry.enabled && API_NAME[entry.meta.slug])
    .map((entry) => ({
      slug: entry.meta.slug,
      apiName: API_NAME[entry.meta.slug] as string,
      workspaceModels: entry.models
        .filter(
          (m) => m.availability === "workspace" || m.availability === "both"
        )
        .map((m) => m.name),
      // Server-only check: whether the deployment has a credential configured.
      // Only this boolean crosses to the client — never the key itself.
      workspaceReady: isWorkspaceConfigured(entry.meta.slug),
    }));

  const connections: ApiConnection[] = catalog.flatMap((entry) =>
    entry.accounts.map((account) => ({
      id: account.id,
      providerSlug: entry.meta.slug,
      label: account.email,
      legacy: account.legacy,
    }))
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
          <CardTitle>AI usage</CardTitle>
          <CardDescription>
            Chat with models provided by this workspace, or connect your own
            developer API key. Your Unified AI Workspace sign-in is separate
            from any provider account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiUsageSettings providers={providers} connections={connections} />
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
