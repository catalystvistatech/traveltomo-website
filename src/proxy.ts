import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // When Supabase Auth doesn't recognise an OAuth redirect URL it falls back
  // to the project's Site URL (the homepage) and appends the one-time
  // ?code=. Nothing on the homepage exchanges it, so the sign-in silently
  // dies. Hand it to the real callback so Google/Apple sign-in still
  // completes even when the redirect allow-list is missing this domain.
  if (pathname === "/") {
    const params = request.nextUrl.searchParams;
    if (params.has("code") || params.has("error_description")) {
      const target = request.nextUrl.clone();
      if (params.has("code")) {
        target.pathname = "/admin/auth/callback";
        target.search = "";
        target.searchParams.set("code", params.get("code") as string);
        target.searchParams.set("next", "/admin");
      } else {
        target.pathname = "/admin/login";
        target.search = "?error=oauth_failed";
      }
      return NextResponse.redirect(target);
    }
  }

  if (pathname.startsWith("/admin")) {
    return await updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
