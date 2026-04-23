import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * GET /v1/notifications?limit=50&unread_only=false
 * Returns the caller's notifications ordered by created_at DESC together
 * with the unread count.
 */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50), 200));
  const unreadOnly = url.searchParams.get("unread_only") === "true";

  let query = client
    .from("notifications")
    .select("id, kind, title, body, icon, deeplink, metadata, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.is("read_at", null);

  const { data, error: listError } = await query;
  if (listError)
    return NextResponse.json({ error: listError.message }, { status: 500 });

  const { data: unreadData, error: countError } = await client.rpc(
    "unread_notification_count",
    { p_user: user.id },
  );
  if (countError)
    return NextResponse.json({ error: countError.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    unread_count: unreadData ?? 0,
  });
}

/**
 * POST /v1/notifications
 * Body: { action: "mark_read", ids?: string[] }
 *   - omit `ids` to mark all unread as read
 */
export async function POST(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { action?: string; ids?: string[] } = {};
  try {
    body = await request.json();
  } catch {}
  const action = body.action ?? "mark_read";

  if (action !== "mark_read")
    return NextResponse.json({ error: "invalid action" }, { status: 400 });

  const ids = Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : null;

  const { data, error: rpcError } = await client.rpc("mark_notifications_read", {
    p_user: user.id,
    p_ids: ids,
  });
  if (rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 });

  return NextResponse.json({ data: { updated: data ?? 0 } });
}
