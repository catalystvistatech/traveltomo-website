import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/** POST /v1/challenges/:id/accept ? user accepts a rolled challenge */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error: insertError } = await client
    .from("challenge_completions")
    .insert({
      user_id: user.id,
      challenge_id: id,
      verification_status: "pending",
      completed_at: null,
    })
    .select("id")
    .single();

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ data });
}
