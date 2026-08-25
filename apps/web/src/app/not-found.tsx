import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This page or conversation doesn&apos;t exist (or isn&apos;t yours).
      </p>
      <Link href="/chat" className="text-sm underline underline-offset-4">
        Back to chat
      </Link>
    </div>
  );
}
