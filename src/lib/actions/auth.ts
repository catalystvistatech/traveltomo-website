"use server";

import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  role: "user" | "merchant" | "admin";
  display_name: string | null;
  avatar_url: string | null;
  email: string;
};

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    ...profile,
    email: user.email ?? "",
  } as UserProfile;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
