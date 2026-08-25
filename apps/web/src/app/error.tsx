"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Route-level error boundary (M9). Errors are logged client-side only —
 * never with tokens or message content beyond what the error itself carries. */
export default function RouteError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    console.error("[uaw] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The error has been logged{error.digest ? ` (ref ${error.digest})` : ""}.
          Your conversations are safe.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
