/** Dashboard-level loading state (M9): lightweight pulse skeleton. */
export default function DashboardLoading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-1 flex-col gap-4 p-6">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-64 max-w-full animate-pulse rounded-md bg-muted" />
    </div>
  );
}
