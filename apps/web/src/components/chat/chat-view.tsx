"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, Settings2 } from "lucide-react";
import { PROVIDERS, type ProviderSelection } from "@uaw/types";
import { isProviderError } from "@uaw/provider-core";
import {
  getAccount,
  getEntry,
  getModel,
  selectionForModel,
  type Catalog,
} from "@/lib/providers/catalog";
import { createRegistryFromCatalog } from "@/lib/providers/registry";
import type { UiChatMessage } from "@/lib/chat/types";
import {
  buildManualPackage,
  buildProviderContext,
  rollingSummary,
} from "@/lib/chat/context";
import {
  createConversation,
  deleteMessage,
  logProviderEvent,
  saveMessage,
  updateConversationSelection,
  updateConversationSummary,
} from "@/lib/chat/actions";
import { CatalogProvider } from "@/components/providers/catalog-context";
import { AiSelector } from "@/components/providers/ai-selector";
import { AccountSelector } from "@/components/providers/account-selector";
import { Composer } from "@/components/chat/composer";
import { buttonVariants } from "@/components/ui/button";
import { ManualHandoff } from "@/components/chat/manual-handoff";
import { MessageList } from "@/components/chat/message-list";
import { cn } from "@/lib/utils";

interface ManualState {
  assistantId: string;
  providerName: string;
  packageText: string;
  selection: ProviderSelection;
}

/**
 * The Master Conversation view: chat header with provider/model/account
 * selectors, message list and composer. Replies flow through the provider
 * registry — mock without a connected account, `official_api` via the proxy
 * routes, `manual` via the user-mediated handoff panel (M6 gate decision).
 */
export function ChatView({
  catalog,
  initialSelection,
  conversationId: initialConversationId,
  initialMessages,
  projectId,
  projectName,
  projectInstructions,
}: Readonly<{
  catalog: Catalog;
  initialSelection: ProviderSelection;
  conversationId?: string;
  initialMessages?: UiChatMessage[];
  projectId?: string;
  projectName?: string;
  projectInstructions?: string | null;
}>) {
  const router = useRouter();
  const registry = React.useMemo(
    () => createRegistryFromCatalog(catalog),
    [catalog]
  );
  const [selection, setSelection] =
    React.useState<ProviderSelection>(initialSelection);
  const [messages, setMessages] = React.useState<UiChatMessage[]>(
    initialMessages ?? []
  );
  const [streamingId, setStreamingId] = React.useState<string | null>(null);
  const [manualState, setManualState] = React.useState<ManualState | null>(
    null
  );
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const conversationIdRef = React.useRef<string | null>(
    initialConversationId ?? null
  );
  const abortRef = React.useRef<AbortController | null>(null);
  const lastSummaryRef = React.useRef<string>("");

  React.useEffect(() => () => abortRef.current?.abort(), []);

  /** Persists fire-and-forget with one retry on transient failure (M9);
   * failures surface as a notice, never block the UI. */
  const persist = React.useCallback(
    (work: () => Promise<{ error?: string }>) => {
      const attempt = async (): Promise<{ error?: string }> => {
        try {
          return await work();
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          return work();
        }
      };
      attempt()
        .then((result) => {
          if (result.error) setSaveError(result.error);
        })
        .catch(() => setSaveError("Could not reach the server"));
    },
    []
  );

  // Provider event bus → provider_events table (PRD §31).
  React.useEffect(
    () =>
      registry.events.on((event) => {
        persist(() =>
          logProviderEvent({
            providerSlug: event.provider,
            eventType: event.type,
            conversationId: conversationIdRef.current,
            metadata: event.detail,
          })
        );
      }),
    [registry, persist]
  );

  // "New chat" clicked while already on /chat — reset in place.
  React.useEffect(() => {
    const reset = () => {
      abortRef.current?.abort();
      abortRef.current = null;
      conversationIdRef.current = null;
      setMessages([]);
      setStreamingId(null);
      setManualState(null);
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

  const persistAssistant = (message: {
    id: string;
    content: string;
    status: UiChatMessage["status"];
    selection: ProviderSelection;
    integration?: UiChatMessage["integration"];
  }) => {
    if (!conversationIdRef.current) return;
    persist(() =>
      saveMessage({
        id: message.id,
        conversationId: conversationIdRef.current as string,
        role: "assistant",
        content: message.content,
        status: message.status,
        selection: message.selection,
        integration: message.integration,
      })
    );
  };

  /** Rolling summary maintenance (PRD §12): recompute after each completed
   * turn; persist only when it changes. */
  const maintainSummary = (finalMessages: UiChatMessage[]) => {
    if (!conversationIdRef.current) return;
    const summary = rollingSummary(finalMessages);
    if (summary === lastSummaryRef.current) return;
    lastSummaryRef.current = summary;
    persist(() =>
      updateConversationSummary(conversationIdRef.current as string, summary)
    );
  };

  /** Logs a context_handoff event when this send targets a different
   * provider than the previous assistant reply (PRD §11, M8). */
  const logHandoffIfSwitched = (
    requestSelection: ProviderSelection,
    context: { strategy: string; includedMessages: number; summaryChars: number },
    history: UiChatMessage[]
  ) => {
    const lastAssistant = [...history]
      .reverse()
      .find((m) => m.role === "assistant" && m.selection);
    if (
      lastAssistant?.selection &&
      lastAssistant.selection.providerSlug !== requestSelection.providerSlug
    ) {
      registry.events.emit({
        type: "context_handoff",
        provider: requestSelection.providerSlug,
        detail: {
          from: lastAssistant.selection.providerSlug,
          to: requestSelection.providerSlug,
          strategy: context.strategy,
          included_messages: String(context.includedMessages),
          summary_chars: String(context.summaryChars),
        },
      });
    }
  };

  const send = async (text: string) => {
    setSaveError(null);
    if (
      !getModel(catalog, selection.providerSlug, selection.modelId) ||
      !getAccount(catalog, selection.providerSlug, selection.accountId)
    ) {
      setSaveError(
        "Select a connected account and an available model before sending."
      );
      return;
    }

    const userMessage: UiChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      status: "completed",
      createdAt: Date.now(),
    };
    const history = [...messages];

    setMessages((prev) => [...prev, userMessage]);

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

    await runAssistantTurn(text, history);
  };

  /** Produces the assistant turn for `text`. Split out of send() so a retry can
   * re-run it without duplicating the user's message. */
  const runAssistantTurn = async (text: string, history: UiChatMessage[]) => {
    const requestSelection = selection;
    const entry = getEntry(catalog, requestSelection.providerSlug);
    const model = getModel(
      catalog,
      requestSelection.providerSlug,
      requestSelection.modelId
    );
    const account = getAccount(
      catalog,
      requestSelection.providerSlug,
      requestSelection.accountId
    );
    if (!model || !account) {
      setSaveError(
        "Select a connected account and an available model before sending."
      );
      return;
    }
    const assistantId = crypto.randomUUID();

    const context = buildProviderContext({
      history,
      prompt: text,
      projectInstructions,
    });
    logHandoffIfSwitched(requestSelection, context, history);

    // ---- Manual mode: the USER performs the provider interaction (PRD §7).
    if (account.integrationMode === "manual") {
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          status: "queued",
          selection: requestSelection,
          integration: "manual",
          createdAt: Date.now(),
        },
      ]);
      setManualState({
        assistantId,
        providerName: entry.meta.name,
        selection: requestSelection,
        packageText: buildManualPackage({
          providerName: entry.meta.name,
          history,
          prompt: text,
          projectInstructions,
        }),
      });
      return;
    }

    // ---- Adapter path: official_api via our proxy route.
    const integration =
      account.integrationMode === "official_api" ? "official_api" : "mock";
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "streaming",
        selection: requestSelection,
        integration,
        createdAt: Date.now(),
      },
    ]);
    setStreamingId(assistantId);

    const finish = (content: string, status: UiChatMessage["status"]) => {
      patchMessage(assistantId, { content, status });
      setStreamingId(null);
      abortRef.current = null;
      persistAssistant({
        id: assistantId,
        content,
        status,
        selection: requestSelection,
        integration,
      });
      if (status === "completed") {
        maintainSummary([
          ...history,
          {
            id: `${assistantId}-prompt`,
            role: "user" as const,
            content: text,
            status: "completed" as const,
            createdAt: Date.now(),
          },
          {
            id: assistantId,
            role: "assistant",
            content,
            status,
            selection: requestSelection,
            createdAt: Date.now(),
          },
        ]);
      }
    };

    let emitted = "";
    try {
      const adapter = registry.getAdapter(requestSelection.providerSlug);
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await adapter.sendMessage({
        messages: context.messages,
        model,
        account,
        signal: controller.signal,
        onChunk: (chunk) => {
          emitted += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m
            )
          );
        },
      });
      finish(response.content, response.status);
    } catch (error) {
      registry.events.emit({
        type: "request_failed",
        provider: requestSelection.providerSlug,
        detail: {
          code: isProviderError(error) ? error.code : "NETWORK_ERROR",
        },
      });
      finish(emitted, "failed");
      setSaveError(
        isProviderError(error) ? error.message : "Provider request failed"
      );
    }
  };

  const completeManual = (reply: string) => {
    if (!manualState) return;
    patchMessage(manualState.assistantId, {
      content: reply,
      status: "completed",
    });
    persistAssistant({
      id: manualState.assistantId,
      content: reply,
      status: "completed",
      selection: manualState.selection,
      integration: "manual",
    });
    maintainSummary(
      messages.map((m) =>
        m.id === manualState.assistantId
          ? { ...m, content: reply, status: "completed" as const }
          : m
      )
    );
    setManualState(null);
  };

  const cancelManual = () => {
    if (!manualState) return;
    setMessages((prev) => prev.filter((m) => m.id !== manualState.assistantId));
    setManualState(null);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  /** Re-runs the newest turn after a failure or a stop. The stale assistant
   * row is removed locally and in the database so a reload shows one reply,
   * not a failed one followed by its replacement. */
  const retryLast = async () => {
    setSaveError(null);
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;

    const prompt = messages[lastUserIndex].content;
    const history = messages.slice(0, lastUserIndex);
    const stale = messages.slice(lastUserIndex + 1);

    setMessages((prev) => prev.slice(0, lastUserIndex + 1));
    if (conversationIdRef.current) {
      for (const message of stale) {
        persist(() => deleteMessage(message.id));
      }
    }
    await runAssistantTurn(prompt, history);
  };

  const changeSelection = (next: ProviderSelection) => {
    const previous = selection;
    setSelection(next);
    if (conversationIdRef.current) {
      persist(() =>
        updateConversationSelection(conversationIdRef.current as string, next)
      );
    }
    if (previous.providerSlug !== next.providerSlug) {
      registry.events.emit({
        type: "provider_switched",
        provider: next.providerSlug,
        detail: { from: previous.providerSlug, to: next.providerSlug },
      });
    } else if (previous.modelId !== next.modelId) {
      registry.events.emit({
        type: "model_changed",
        provider: next.providerSlug,
        detail: { from: previous.modelId, to: next.modelId },
      });
    }
  };

  const streaming = streamingId !== null;
  const busy = streaming || manualState !== null;
  const empty = messages.length === 0;
  const activeAccount = getAccount(
    catalog,
    selection.providerSlug,
    selection.accountId
  );

  const providerName = getEntry(catalog, selection.providerSlug).meta.name;
  const composerArea = manualState ? (
    <ManualHandoff
      providerName={manualState.providerName}
      packageText={manualState.packageText}
      onSave={completeManual}
      onCancel={cancelManual}
    />
  ) : activeAccount ? (
    <Composer onSend={send} onStop={stop} streaming={streaming} />
  ) : (
    <NoAccountNotice providerName={providerName} />
  );

  return (
    <CatalogProvider catalog={catalog}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chat header (PRD §13, §15–16) */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-1">
            <AiSelector
              selection={selection}
              disabled={busy}
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
            disabled={busy}
            onSelectAccount={(accountId) =>
              changeSelection({ ...selection, accountId })
            }
          />
        </header>

        {saveError && (
          <p
            role="alert"
            className="mx-auto w-full max-w-3xl break-words px-4 text-xs text-destructive"
          >
            {saveError}
          </p>
        )}

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16">
            <EmptyState />
            <div className="w-full max-w-2xl">{composerArea}</div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <MessageList messages={messages} onRetry={retryLast} />
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-3">
              {composerArea}
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
            {provider.phase === "phase2" && " · soon"}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Shown instead of the composer when the active provider has no connected
 * account. Sending is blocked rather than answered with simulated text. */
function NoAccountNotice({ providerName }: Readonly<{ providerName: string }>) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-4 text-center">
      <p className="text-sm font-medium">Connect a {providerName} account</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Choose manual mode to paste prompts and replies yourself, or add your own
        API key for automatic replies. Your key stays in this browser.
      </p>
      <Link
        href="/settings"
        className={cn(
          buttonVariants({ variant: "default", size: "sm" }),
          "mt-3 gap-1.5"
        )}
      >
        <Settings2 className="size-4" />
        Open Settings
      </Link>
    </div>
  );
}
