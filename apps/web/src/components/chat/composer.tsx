"use client";

import * as React from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_HEIGHT_PX = 200;

/**
 * Chat composer (PRD §22): multiline, Enter to send, Shift+Enter for a
 * newline, stop generation. Attachments arrive with Milestone 3.
 */
export function Composer({
  onSend,
  onStop,
  streaming,
}: Readonly<{
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
}>) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text || streaming) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(resize);
  };

  return (
    <div className="w-full rounded-2xl border bg-card p-2 shadow-sm focus-within:border-ring">
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        placeholder="Ask anything…"
        aria-label="Message"
        className="max-h-50 w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        onChange={(event) => {
          setValue(event.target.value);
          resize();
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="icon"
          disabled
          aria-label="Attach file"
          title="Attachments arrive with Milestone 3"
        >
          <Paperclip />
        </Button>
        {streaming ? (
          <Button size="icon" aria-label="Stop generating" onClick={onStop}>
            <Square />
          </Button>
        ) : (
          <Button
            size="icon"
            aria-label="Send"
            disabled={value.trim().length === 0}
            onClick={submit}
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
}
