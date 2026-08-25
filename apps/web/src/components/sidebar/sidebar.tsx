"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Bot,
  Check,
  FolderKanban,
  LogOut,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import {
  archiveConversation,
  deleteConversation,
  renameConversation,
} from "@/lib/chat/actions";
import type { ConversationListItem } from "@/lib/db/queries";
import { SearchDialog } from "@/components/sidebar/search-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sidebar contents (PRD §14): New Chat, Search, Projects, Recent
 * conversations (live since Milestone 3), Settings, user profile.
 */
export function Sidebar({
  email,
  recents,
  onCollapse,
  onNavigate,
}: Readonly<{
  email: string;
  recents: ConversationListItem[];
  onCollapse: () => void;
  onNavigate: () => void;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const initial = (email[0] ?? "?").toUpperCase();

  const navItem = (href: string, label: string, icon: React.ReactNode) => (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        pathname.startsWith(href) &&
          "bg-sidebar-accent text-sidebar-accent-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="flex h-full w-64 flex-col md:w-full">
      {/* Brand + collapse */}
      <div className="flex h-12 items-center justify-between px-3">
        <Link
          href="/chat"
          onClick={onNavigate}
          className="flex items-center gap-2 font-semibold"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Bot className="size-4" />
          </span>
          <span className="text-sm">Unified AI</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse sidebar"
          className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent"
          onClick={onCollapse}
        >
          <PanelLeftClose />
        </Button>
      </div>

      <div className="flex flex-col gap-1 px-3 pt-2">
        <Link
          href="/chat"
          onClick={() => {
            onNavigate();
            // Already on /chat (new-chat view): no navigation fires, so ask
            // the ChatView to reset in place.
            if (pathname === "/chat") {
              window.dispatchEvent(new CustomEvent("uaw:new-chat"));
            }
          }}
          className="flex items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent"
        >
          <SquarePen className="size-4" />
          New chat
        </Link>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Search className="size-4" />
          Search
        </button>
      </div>

      {/* Scrollable middle: projects + recents */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3">
        <div>
          <span className="px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Projects
          </span>
          <div className="pt-1">
            {navItem(
              "/projects",
              "All projects",
              <FolderKanban className="size-4" />
            )}
          </div>
        </div>

        <div>
          <span className="px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Recent chats
          </span>
          {recents.length === 0 ? (
            <p className="px-2 pt-1 text-xs text-sidebar-foreground/50">
              No conversations yet
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 pt-1">
              {recents.map((conversation) => (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  active={pathname === `/chat/${conversation.id}`}
                  onNavigate={onNavigate}
                  onAfterMutate={(deletedActive) => {
                    if (deletedActive) router.push("/chat");
                    router.refresh();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom: settings + profile */}
      <div className="border-t border-sidebar-border p-3">
        {navItem("/settings", "Settings", <Settings className="size-4" />)}
        <div className="mt-2 flex items-center gap-2 px-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-sidebar-foreground/70">
            {email}
          </span>
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="size-8 text-sidebar-foreground/70 hover:bg-sidebar-accent"
            >
              <LogOut />
            </Button>
          </form>
        </div>
      </div>

      {searchOpen && (
        <SearchDialog
          onClose={() => setSearchOpen(false)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function ConversationItem({
  conversation,
  active,
  onNavigate,
  onAfterMutate,
}: Readonly<{
  conversation: ConversationListItem;
  active: boolean;
  onNavigate: () => void;
  onAfterMutate: (deletedActive: boolean) => void;
}>) {
  const [renaming, setRenaming] = React.useState(false);
  const [title, setTitle] = React.useState(conversation.title);
  const [busy, setBusy] = React.useState(false);

  const commitRename = async () => {
    const next = title.trim();
    setRenaming(false);
    if (!next || next === conversation.title) {
      setTitle(conversation.title);
      return;
    }
    setBusy(true);
    await renameConversation(conversation.id, next);
    setBusy(false);
    onAfterMutate(false);
  };

  if (renaming) {
    return (
      <li className="flex items-center gap-1 rounded-md bg-sidebar-accent px-2 py-1">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") {
              setTitle(conversation.title);
              setRenaming(false);
            }
          }}
          aria-label="Conversation title"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          aria-label="Save title"
          className="shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={() => void commitRename()}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Cancel rename"
          className="shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={() => {
            setTitle(conversation.title);
            setRenaming(false);
          }}
        >
          <X className="size-3.5" />
        </button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center rounded-md transition-colors hover:bg-sidebar-accent",
        active && "bg-sidebar-accent",
        busy && "opacity-50"
      )}
    >
      <Link
        href={`/chat/${conversation.id}`}
        onClick={onNavigate}
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm"
        title={conversation.title}
      >
        {conversation.title}
      </Link>
      <span className="hidden shrink-0 items-center gap-0.5 pr-1 group-hover:flex">
        <button
          type="button"
          aria-label="Rename conversation"
          className="rounded p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setRenaming(true)}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Archive conversation"
          className="rounded p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={async () => {
            setBusy(true);
            await archiveConversation(conversation.id);
            onAfterMutate(active);
          }}
        >
          <Archive className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Delete conversation"
          className="rounded p-1 text-sidebar-foreground/60 hover:text-destructive"
          onClick={async () => {
            if (!window.confirm(`Delete "${conversation.title}"?`)) return;
            setBusy(true);
            await deleteConversation(conversation.id);
            onAfterMutate(active);
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>
    </li>
  );
}
