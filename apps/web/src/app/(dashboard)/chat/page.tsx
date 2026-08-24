import { ArrowUp, Paperclip } from "lucide-react";
import { PROVIDERS } from "@uaw/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Chat",
};

/**
 * Milestone 1 placeholder: the empty state of a Master Conversation.
 * The live composer, provider/model/account selectors and message list
 * arrive with Milestones 2–4 (mock providers first, PRD §60).
 */
export default function ChatPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-10">
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

      {/* Composer preview — disabled until Milestone 2/4 wire it up */}
      <div className="w-full max-w-2xl rounded-2xl border bg-card p-3 shadow-sm">
        <textarea
          disabled
          rows={2}
          placeholder="Ask anything… (composer goes live with Milestone 4 mock providers)"
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="icon"
            disabled
            aria-label="Attach file (Milestone 3+)"
          >
            <Paperclip />
          </Button>
          <Button size="icon" disabled aria-label="Send (Milestone 4)">
            <ArrowUp />
          </Button>
        </div>
      </div>
    </div>
  );
}
