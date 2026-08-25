"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import {
  queryExtensionStatus,
  type ExtensionStatus,
} from "@/lib/extension/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Companion extension connection status (PRD §27–28, Milestone 5). */
export function ExtensionStatusCard() {
  const [status, setStatus] = React.useState<ExtensionStatus | null>(null);
  const [checking, setChecking] = React.useState(false);

  const check = React.useCallback(async () => {
    setChecking(true);
    setStatus(await queryExtensionStatus());
    setChecking(false);
  }, []);

  React.useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={cn(
              "size-2 rounded-full",
              status?.available ? "bg-emerald-500" : "bg-muted-foreground/40"
            )}
          />
          {status === null
            ? "Checking…"
            : status.available
              ? "Extension connected"
              : "Extension not detected"}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={checking}
          onClick={() => void check()}
        >
          <RefreshCw className={cn(checking && "animate-spin")} />
          Recheck
        </Button>
      </div>

      {status?.available ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {status.providers.map((provider) => (
            <li key={provider.slug} className="flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  provider.tabCount > 0
                    ? "bg-emerald-500"
                    : "bg-muted-foreground/40"
                )}
              />
              {provider.name}:{" "}
              {provider.tabCount > 0
                ? `${provider.tabCount} tab${provider.tabCount > 1 ? "s" : ""} open`
                : "no tab open"}
            </li>
          ))}
        </ul>
      ) : (
        status !== null && (
          <p className="text-xs text-muted-foreground">
            Build it with <code>pnpm --filter @uaw/extension build</code> and
            load <code>apps/extension/dist</code> via chrome://extensions →
            “Load unpacked”. The extension only reports which provider tabs are
            open — it never automates provider sites.
          </p>
        )
      )}
    </div>
  );
}
