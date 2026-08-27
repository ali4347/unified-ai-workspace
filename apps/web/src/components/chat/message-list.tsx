"use client";

import * as React from "react";
import { ArrowLeftRight, Check, Copy, RotateCw } from "lucide-react";
import type { UiChatMessage } from "@/lib/chat/types";
import { useCatalog } from "@/components/providers/catalog-context";
import { ProviderBadge } from "@/components/providers/provider-badge";
import { MessageContent } from "@/components/chat/message-content";
import { Button } from "@/components/ui/button";

/**
 * Master Conversation message list (PRD §23–24): user/assistant turns,
 * provider badges on assistant messages, and a divider whenever the
 * provider changes mid-conversation (PRD §3).
 */
export function MessageList({
  messages,
  onRetry,
}: Readonly<{ messages: UiChatMessage[]; onRetry?: () => void }>) {
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const lastAssistantId = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.id;

  let lastProviderSlug: string | undefined;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      {messages.map((message) => {
        let divider: React.ReactNode = null;
        if (message.role === "assistant" && message.selection) {
          if (
            lastProviderSlug !== undefined &&
            lastProviderSlug !== message.selection.providerSlug
          ) {
            divider = <ProviderChangeDivider message={message} />;
          }
          lastProviderSlug = message.selection.providerSlug;
        }

        return (
          <React.Fragment key={message.id}>
            {divider}
            {message.role === "user" ? (
              <UserMessage message={message} />
            ) : (
              <AssistantMessage
                message={message}
                onRetry={
                  // Only the newest turn can be retried — replaying an older
                  // one would fork the conversation.
                  message.id === lastAssistantId ? onRetry : undefined
                }
              />
            )}
          </React.Fragment>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function ProviderChangeDivider({
  message,
}: Readonly<{ message: UiChatMessage }>) {
  const catalog = useCatalog();
  if (!message.selection) return null;
  const entry = catalog.find(
    (e) => e.meta.slug === message.selection?.providerSlug
  );
  const model = entry?.models.find((m) => m.id === message.selection?.modelId);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5">
        <ArrowLeftRight className="size-3" />
        Provider changed — now{" "}
        {entry?.meta.name ?? message.selection.providerSlug}
        {model ? ` · ${model.name}` : ""}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function UserMessage({ message }: Readonly<{ message: UiChatMessage }>) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  onRetry,
}: Readonly<{ message: UiChatMessage; onRetry?: () => void }>) {
  const incomplete =
    message.status === "failed" || message.status === "cancelled";

  return (
    <div className="group flex min-w-0 flex-col gap-1.5">
      {message.selection && (
        <ProviderBadge
          selection={message.selection}
          integration={message.integration}
        />
      )}
      <div className="min-w-0">
        <MessageContent content={message.content} />
        {message.status === "streaming" && (
          <span
            aria-label="Generating response"
            className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-foreground/70 align-text-bottom"
          />
        )}
        {message.status === "queued" && message.content.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Waiting for the reply you paste back…
          </p>
        )}
      </div>
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {message.status === "cancelled" && (
          <span className="text-xs text-muted-foreground">Stopped</span>
        )}
        {message.status === "failed" && (
          <span className="text-xs text-destructive">
            Couldn&apos;t get a reply
          </span>
        )}
        {incomplete && onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onRetry}
          >
            <RotateCw className="size-3" />
            Try again
          </Button>
        )}
        {message.status === "completed" && message.content.length > 0 && (
          <CopyButton content={message.content} />
        )}
      </div>
    </div>
  );
}

function CopyButton({ content }: Readonly<{ content: string }>) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Copy message"
      className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard unavailable (permissions/insecure context) — ignore.
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
