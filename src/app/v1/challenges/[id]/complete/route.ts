import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/challenges/:id/complete
 * Body: { completion_id, gps_latitude?, gps_longitude?, proof_url? }
 * Marks the completion as pending merchant verification and generates the
 * short verification code the user will show at the business.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    completion_id?: string;
    gps_latitude?: number;
    gps_longitude?: number;
    proof_url?: string;
  };

  const code = generateCode();

  const q = client
    .from("challenge_completions")
    .update({
      verification_status: "pending",
      verification_code: code,
      completed_at: new Date().toISOString(),
      gps_latitude: body.gps_latitude ?? null,
      gps_longitude: body.gps_longitude ?? null,
      proof_url: body.proof_url ?? null,
    })
    .eq("user_id", user.id)
    .eq("challenge_id", id);

  const filtered = body.completion_id ? q.eq("id", body.completion_id) : q;
  const { data, error: updateError } = await filtered.select("id").maybeSingle();

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 400 });

  return NextResponse.json({ data: { ...data, verification_code: code } });
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
