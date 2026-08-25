"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { PROVIDERS, type ProviderSelection } from "@uaw/types";
import {
  getEntry,
  getModel,
  selectionForModel,
  type Catalog,
} from "@/lib/providers/catalog";
import {
  streamMockReply,
  type UiChatMessage,
} from "@/lib/providers/mock-chat";
import {
  createConversation,
  saveMessage,
  updateConversationSelection,
} from "@/lib/chat/actions";
import { CatalogProvider } from "@/components/providers/catalog-context";
import { AiSelector } from "@/components/providers/ai-selector";
import { AccountSelector } from "@/components/providers/account-selector";
import { Composer } from "@/components/chat/composer";
import { MessageList } from "@/components/chat/message-list";
import { cn } from "@/lib/utils";

/**
 * The Master Conversation view: chat header with provider/model/account
 * selectors, message list and composer. Messages persist through the chat
 * actions (Milestone 3); replies come from the mock engine until the
 * adapter registry (Milestone 4) and real integrations (Milestone 6).
 */
export function ChatView({
  catalog,
  initialSelection,
  conversationId: initialConversationId,
  initialMessages,
  projectId,
  projectName,
}: Readonly<{
  catalog: Catalog;
  initialSelection: ProviderSelection;
  conversationId?: string;
  initialMessages?: UiChatMessage[];
  projectId?: string;
  projectName?: string;
}>) {
  const router = useRouter();
  const [selection, setSelection] =
    React.useState<ProviderSelection>(initialSelection);
  const [messages, setMessages] = React.useState<UiChatMessage[]>(
    initialMessages ?? []
  );
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const conversationIdRef = React.useRef<string | null>(
    initialConversationId ?? null
  );
  const cancelRef = React.useRef<(() => void) | null>(null);

  React.useEffect(() => () => cancelRef.current?.(), []);

  // "New chat" clicked while already on /chat (no router navigation happens
  // because the URL only changed via history.replaceState) — reset in place.
  React.useEffect(() => {
    const reset = () => {
      cancelRef.current?.();
      cancelRef.current = null;
      conversationIdRef.current = null;
      setMessages([]);
      setStreamingId(null);
      setSaveError(null);
      setSelection(initialSelection);
      window.history.replaceState(null, "", "/chat");
    };
    window.addEventListener("uaw:new-chat", reset);
    return () => window.removeEventListener("uaw:new-chat", reset);
  }, [initialSelection]);

  const patchMessage = (id: string, patch: Partial<UiChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  /** Persists fire-and-forget; failures surface as a notice, never block UI. */
  const persist = (work: () => Promise<{ error?: string }>) => {
    work()
      .then((result) => {
        if (result.error) setSaveError(result.error);
      })
      .catch(() => setSaveError("Could not reach the server"));
  };

  const ensureConversation = async (
    firstMessage: string
  ): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    try {
      const result = await createConversation({
        title: firstMessage,
        selection,
        projectId: projectId ?? null,
      });
      if (!result.id) {
        if (result.error) setSaveError(result.error);
        return null;
      }
      conversationIdRef.current = result.id;
      window.history.replaceState(null, "", `/chat/${result.id}`);
      router.refresh(); // sidebar recents pick up the new conversation
      return result.id;
    } catch {
      setSaveError("Could not reach the server");
      return null;
    }
  };

  const send = async (text: string) => {
    setSaveError(null);
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

    // Conversation + user message persist while the mock reply streams.
    const conversationId = await ensureConversation(text);
    if (conversationId) {
      persist(() =>
        saveMessage({
          id: userMessage.id,
          conversationId,
          role: "user",
          content: text,
          status: "completed",
        })
      );
    }

    const finishedSelection = selection;
    const entry = getEntry(catalog, selection.providerSlug);
    const model = getModel(catalog, selection.providerSlug, selection.modelId);

    cancelRef.current = streamMockReply(
      { providerName: entry.meta.name, modelName: model?.name ?? "model" },
      text,
      {
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        },
        onComplete: () => {
          setStreamingId(null);
          cancelRef.current = null;
          setMessages((prev) => {
            const finished = prev.find((m) => m.id === assistantId);
            if (finished && conversationIdRef.current) {
              persist(() =>
                saveMessage({
                  id: assistantId,
                  conversationId: conversationIdRef.current as string,
                  role: "assistant",
                  content: finished.content,
                  status: "completed",
                  selection: finishedSelection,
                })
              );
            }
            return prev.map((m) =>
              m.id === assistantId ? { ...m, status: "completed" } : m
            );
          });
        },
      }
    );
  };

  const stop = () => {
    cancelRef.current?.();
    cancelRef.current = null;
    if (streamingId) {
      const stopped = messages.find((m) => m.id === streamingId);
      patchMessage(streamingId, { status: "cancelled" });
      if (conversationIdRef.current) {
        persist(() =>
          saveMessage({
            id: streamingId,
            conversationId: conversationIdRef.current as string,
            role: "assistant",
            content: stopped?.content ?? "",
            status: "cancelled",
            selection: stopped?.selection ?? selection,
          })
        );
      }
    }
    setStreamingId(null);
  };

  const changeSelection = (next: ProviderSelection) => {
    setSelection(next);
    if (conversationIdRef.current) {
      persist(() =>
        updateConversationSelection(conversationIdRef.current as string, next)
      );
    }
  };

  const streaming = streamingId !== null;
  const empty = messages.length === 0;

  return (
    <CatalogProvider catalog={catalog}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chat header (PRD §13, §15–16) */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-1">
            <AiSelector
              selection={selection}
              disabled={streaming}
              onSelect={(model) =>
                changeSelection(selectionForModel(catalog, selection, model))
              }
            />
            {projectName && (
              <span className="hidden items-center gap-1 truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:flex">
                <FolderKanban className="size-3" />
                {projectName}
              </span>
            )}
          </div>
          <AccountSelector
            selection={selection}
            disabled={streaming}
            onSelectAccount={(accountId) =>
              changeSelection({ ...selection, accountId })
            }
          />
        </header>

        {saveError && (
          <p className="mx-auto w-full max-w-3xl px-4 text-xs text-destructive">
            Saving failed: {saveError}. Messages stay visible but may not be
            stored.
          </p>
        )}

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
    </CatalogProvider>
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
      Milestone 6.
    </p>
  );
}
