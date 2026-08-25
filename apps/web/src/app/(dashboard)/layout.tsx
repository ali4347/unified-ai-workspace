import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getRecentConversations } from "@/lib/db/queries";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  // Middleware already guards these routes; this is defense in depth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const recents = await getRecentConversations();

  return (
    <AppShell email={user.email ?? ""} recents={recents}>
      {children}
    </AppShell>
  );
}
