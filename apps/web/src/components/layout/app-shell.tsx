"use client";

import { useState } from "react";
import { PanelLeft } from "lucide-react";
import { Sidebar } from "@/components/sidebar/sidebar";
import type { ConversationListItem } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Responsive app shell (PRD §13–14, §39): fixed sidebar on desktop with
 * collapse/expand, drawer on mobile.
 */
export function AppShell({
  email,
  recents,
  children,
}: Readonly<{
  email: string;
  recents: ConversationListItem[];
  children: React.ReactNode;
}>) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex md:flex-col",
          collapsed ? "md:w-0 md:overflow-hidden md:border-r-0" : "md:w-64"
        )}
      >
        <Sidebar
          email={email}
          recents={recents}
          onCollapse={() => setCollapsed(true)}
          onNavigate={() => undefined}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close sidebar"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl">
            <Sidebar
              email={email}
              recents={recents}
              onCollapse={() => setMobileOpen(false)}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: expand button (desktop, when collapsed) + menu (mobile).
            Hidden on desktop while the sidebar is expanded so pages own the
            full height (the chat header sits directly at the top). */}
        <header
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 px-3",
            !collapsed && "md:hidden"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft />
          </Button>
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand sidebar"
              className="hidden md:inline-flex"
              onClick={() => setCollapsed(false)}
            >
              <PanelLeft />
            </Button>
          )}
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
