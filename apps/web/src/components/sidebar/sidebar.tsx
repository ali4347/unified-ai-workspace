"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  FolderKanban,
  LogOut,
  PanelLeftClose,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Sidebar contents (PRD §14): New Chat, Search, Projects, Recent
 * conversations, Settings, user profile. Recents/search light up with
 * Milestone 3 persistence.
 */
export function Sidebar({
  email,
  onCollapse,
  onNavigate,
}: Readonly<{
  email: string;
  onCollapse: () => void;
  onNavigate: () => void;
}>) {
  const pathname = usePathname();
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
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md border border-sidebar-border px-2 py-1.5 text-sm font-medium transition-colors hover:bg-sidebar-accent"
        >
          <SquarePen className="size-4" />
          New chat
        </Link>

        <div
          className="mt-1 flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/50"
          title="Search arrives with Milestone 3"
        >
          <Search className="size-4" />
          Search
        </div>
      </div>

      {/* Scrollable middle: projects + recents */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
              Projects
            </span>
          </div>
          {navItem(
            "/projects",
            "All projects",
            <FolderKanban className="size-4" />
          )}
          <p className="px-2 pt-1 text-xs text-sidebar-foreground/50">
            No projects yet
          </p>
        </div>

        <div>
          <span className="px-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/50">
            Recent chats
          </span>
          <p className="px-2 pt-1 text-xs text-sidebar-foreground/50">
            No conversations yet
          </p>
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
    </div>
  );
}
