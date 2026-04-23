import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated as the calling user via the
 * `Authorization: Bearer <access_token>` header. Used by /v1 routes so the
 * iOS app can call our API without cookies.
 */
export function createApiClient(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
    }
  );
}

export async function requireUser(request: Request) {
  const client = createApiClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { user: null, client, error: "unauthenticated" as const };
  return { user: data.user, client, error: null };
}
