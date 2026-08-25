/** Conversation loading state (M9): header + message skeletons. */
export default function ConversationLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center px-4">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6">
        <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 w-4/5 animate-pulse rounded-md bg-muted" />
        <div className="ml-auto h-10 w-1/3 animate-pulse rounded-2xl bg-muted" />
        <div className="h-16 w-3/4 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
