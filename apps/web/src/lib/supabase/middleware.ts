import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

/** Paths reachable without a session. Everything else requires auth. */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Refreshes the Supabase session cookie and enforces route protection.
 * The cookie handling follows the @supabase/ssr contract: the response must
 * carry any cookies the client sets, or sessions randomly expire.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Not configured yet — let every route through; the UI shows a setup
    // notice instead of the login form.
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and auth.getUser() —
  // it can cause hard-to-debug session loss.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    // Preserve refreshed session cookies across the redirect.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  };

  if (!user && !isPublicPath(pathname)) {
    return redirectTo("/login");
  }

  if (user && pathname === "/login") {
    return redirectTo("/chat");
  }

  return supabaseResponse;
}
