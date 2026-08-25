"use client";

import * as React from "react";
import { PROVIDERS, type ProviderSelection } from "@uaw/types";
import {
  DEFAULT_SELECTION,
  selectionForModel,
} from "@/lib/providers/catalog";
import {
  streamMockReply,
  type UiChatMessage,
} from "@/lib/providers/mock-chat";
import { AiSelector } from "@/components/providers/ai-selector";
import { AccountSelector } from "@/components/providers/account-selector";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { cn } from "@/lib/utils";

/**
 * The Master Conversation view (Milestone 2): chat header with
 * provider/model/account selectors, message list and composer, backed by
 * the mock chat engine. Persistence arrives with Milestone 3, the real
 * adapter registry with Milestone 4.
 */
export function ChatView() {
  const [selection, setSelection] =
    React.useState<ProviderSelection>(DEFAULT_SELECTION);
  const [messages, setMessages] = React.useState<UiChatMessage[]>([]);
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const cancelRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => () => cancelRef.current?.(), []);

  const patchMessage = (id: string, patch: Partial<UiChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const send = (text: string) => {
    const userMessage: UiChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      status: "completed",
      createdAt: Date.now(),
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: UiChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "streaming",
      selection,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setStreamingId(assistantId);
    cancelRef.current = streamMockReply(selection, text, {
      onChunk: (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      },
      onComplete: () => {
        patchMessage(assistantId, { status: "completed" });
        setStreamingId(null);
        cancelRef.current = null;
      },
    });
  };

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    if (streamingId) patchMessage(streamingId, { status: "cancelled" });
    setStreamingId(null);
  };

  const streaming = streamingId !== null;
  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Chat header (PRD §13, §15–16) */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 md:px-4">
        <AiSelector
          selection={selection}
          disabled={streaming}
          onSelect={(model) =>
            setSelection((current) => selectionForModel(current, model))
          }
        />
        <AccountSelector
          selection={selection}
          disabled={streaming}
          onSelectAccount={(accountId) =>
            setSelection((current) => ({ ...current, accountId }))
          }
        />
      </header>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
          <EmptyState />
          <div className="w-full max-w-2xl">
            <Composer onSend={send} onStop={stop} streaming={streaming} />
            <MockNotice />
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MessageList messages={messages} />
          </div>
          <div className="mx-auto w-full max-w-3xl px-4 pb-3">
            <Composer onSend={send} onStop={stop} streaming={streaming} />
            <MockNotice />
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Start with one AI. Switch to another. Keep the same work.
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          A Master Conversation belongs to your workspace — AI providers are
          participants in it.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {PROVIDERS.map((provider) => (
          <span
            key={provider.slug}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              provider.phase === "mvp"
                ? "border-border text-foreground"
                : "border-border/60 text-muted-foreground"
            )}
          >
            {provider.name}
            {provider.phase === "phase2" && " · Phase 2"}
          </span>
        ))}
      </div>
    </div>
  );
}

function MockNotice() {
  return (
    <p className="pt-2 text-center text-xs text-muted-foreground">
      Mock providers — replies are simulated. Real integrations arrive with
      Milestone 6. Messages are not saved yet (Milestone 3).
    </p>
  );
}
