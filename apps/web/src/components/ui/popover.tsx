"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal hand-rolled popover (no Radix yet — see ARCHITECTURE.md decisions).
 * Closes on outside pointer-down and Escape. Swap for the shadcn/Radix
 * popover if richer focus management is ever needed.
 */

interface PopoverContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  contentId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverContext(component: string): PopoverContextValue {
  const context = React.useContext(PopoverContext);
  if (!context) throw new Error(`${component} must be used within <Popover>`);
  return context;
}

export function Popover({
  className,
  children,
}: Readonly<{ className?: string; children: React.ReactNode }>) {
  const [open, setOpen] = React.useState(false);
  const contentId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <PopoverContext.Provider value={{ open, setOpen, contentId, triggerRef }}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
      </div>
    </PopoverContext.Provider>
  );
}

export function PopoverTrigger({
  className,
  children,
  disabled,
  "aria-label": ariaLabel,
}: Readonly<{
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
}>) {
  const { open, setOpen, contentId, triggerRef } =
    usePopoverContext("PopoverTrigger");

  return (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? contentId : undefined}
      onClick={() => setOpen(!open)}
      className={className}
    >
      {children}
    </button>
  );
}

export function PopoverContent({
  className,
  children,
  align = "start",
}: Readonly<{
  className?: string;
  children: React.ReactNode;
  align?: "start" | "end";
}>) {
  const { open, contentId } = usePopoverContext("PopoverContent");
  if (!open) return null;

  return (
    <div
      id={contentId}
      role="menu"
      className={cn(
        "absolute top-full z-50 mt-1 min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md",
        align === "start" ? "left-0" : "right-0",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Hook for selector items: closes the popover after an action. */
export function usePopoverClose(): () => void {
  const { setOpen } = usePopoverContext("usePopoverClose");
  return React.useCallback(() => setOpen(false), [setOpen]);
}
