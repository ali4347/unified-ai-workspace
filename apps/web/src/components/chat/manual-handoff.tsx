"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Manual-mode handoff (M6, PRD §7 `manual`): the app builds the context
 * package; the USER performs the provider interaction — copy the package
 * into the provider's own interface, then paste the reply back. Zero
 * automation of the provider site.
 */
export function ManualHandoff({
  providerName,
  packageText,
  onSave,
  onCancel,
}: Readonly<{
  providerName: string;
  packageText: string;
  onSave: (reply: string) => void;
  onCancel: () => void;
}>) {
  const [reply, setReply] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="w-full space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium">
          Manual handoff to {providerName}
        </p>
        <p className="text-xs text-muted-foreground">
          1. Copy the context package. 2. Paste it into {providerName} in your
          own browser session. 3. Paste {providerName}&apos;s reply below.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Context package
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(packageText);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard unavailable — user can select the text manually.
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <textarea
          readOnly
          value={packageText}
          rows={5}
          aria-label="Context package"
          className="w-full resize-y rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="manual-reply"
          className="text-xs font-medium text-muted-foreground"
        >
          {providerName}&apos;s reply
        </label>
        <textarea
          id="manual-reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={5}
          placeholder={`Paste ${providerName}'s reply here…`}
          className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={reply.trim().length === 0}
          onClick={() => onSave(reply.trim())}
        >
          Save reply
        </Button>
      </div>
    </div>
  );
}
