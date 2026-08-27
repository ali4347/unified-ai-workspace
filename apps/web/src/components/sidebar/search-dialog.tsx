"use client";

import * as React from "react";
import Link from "next/link";
import { FolderKanban, MessageSquare, Search } from "lucide-react";
import { searchWorkspace, type SearchResult } from "@/lib/chat/actions";

const EMPTY: SearchResult = { conversations: [], projects: [] };

/**
 * Global search (PRD §38): conversation titles, message contents, project
 * names — ILIKE queries server-side, debounced here.
 */
export function SearchDialog({
  onClose,
  onNavigate,
}: Readonly<{ onClose: () => void; onNavigate: () => void }>) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult>(EMPTY);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        setResults(await searchWorkspace(query));
      } catch {
        setResults(EMPTY);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const close = () => {
    onNavigate();
    onClose();
  };

  const hasResults =
    results.conversations.length > 0 || results.projects.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh] sm:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <button
        aria-label="Close search"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-xl border bg-popover text-popover-foreground shadow-lg">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, messages, projects…"
            aria-label="Search query"
            className="h-11 w-full rounded-sm bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {query.trim().length < 2 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          ) : searching ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : !hasResults ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          ) : (
            <>
              {results.conversations.map((conversation) => (
                <Link
                  key={conversation.id}
                  href={`/chat/${conversation.id}`}
                  onClick={close}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{conversation.title}</span>
                </Link>
              ))}
              {results.projects.map((project) => (
                <Link
                  key={project.id}
                  href="/projects"
                  onClick={close}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
