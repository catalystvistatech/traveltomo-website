import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /v1/me/delete - permanently deletes the calling user's account.
 *
 * Required for App Store compliance (guideline 5.1.1(v): apps that let users
 * create an account must let them delete it in-app). Deleting the auth user
 * cascades through `profiles.id -> auth.users(id) ON DELETE CASCADE` to every
 * owned row (notifications, completions, progress, businesses, ...).
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
