import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

const PROFILE_COLUMNS =
  "id, display_name, avatar_url, avatar_index, phone, bio, role, merchant_request_status, onboarding_completed, preferred_categories, preferred_establishment_types, stay_duration, stay_start, stay_end, xp";

/** GET /v1/profile - returns the caller's profile row. */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error: profileError } = await client
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (profileError)
    return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json({
    data: {
      ...(data ?? { id: user.id }),
      email: user.email ?? null,
    },
  });
}

const PatchSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  avatar_url: z.string().url().max(2048).nullable().optional(),
  phone: z.string().max(32).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
});

/** PATCH /v1/profile - updates the caller's profile. */
export async function PATCH(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );

  const updates = parsed.data;
  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "no updates provided" }, { status: 400 });

  const { data, error: updateError } = await client
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    data: { ...(data ?? {}), email: user.email ?? null },
  });
}
