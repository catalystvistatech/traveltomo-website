"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/actions/auth";

export interface OverviewBusiness {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  verification_status: string;
  merchant_name: string | null;
  merchant_email: string | null;
  live_quests: number;
  created_at: string;
}

export interface OverviewUser {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  banned_at: string | null;
  created_at: string;
}

export interface PlatformOverview {
  roleCounts: Record<string, number>;
  totalUsers: number;
  bannedUsers: number;
  newUsersThisWeek: number;
  liveQuests: number;
  businesses: OverviewBusiness[];
  recentUsers: OverviewUser[];
}

/**
 * Everything the superadmin overview shows in one round trip: user counts
 * by role, every business with its pin and live-quest count, and the
 * latest sign-ups. Superadmin only; reads with the service role.
 */
export async function getPlatformOverview(): Promise<
  { data: PlatformOverview } | { error: string }
> {
  try {
    const me = await getCurrentUser();
    if (!me || me.role !== "superadmin") return { error: "Unauthorized" };

    const admin = createAdminClient();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

    const [profilesRes, businessesRes, questsRes, recentRes] = await Promise.all([
      admin.from("profiles").select("id, role, banned_at, created_at"),
      admin
        .from("businesses")
        .select(
          "id, name, city, address, latitude, longitude, verification_status, created_at, merchant_id, profiles!businesses_merchant_id_fkey(display_name, email)"
        )
        .order("created_at", { ascending: false }),
      admin
        .from("travel_challenges")
        .select("id, business_id")
        .eq("status", "live")
        .is("deleted_at", null),
      admin
        .from("profiles")
        .select("id, email, display_name, role, banned_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const failed = [profilesRes, businessesRes, questsRes, recentRes].find((r) => r.error);
    if (failed?.error) return { error: failed.error.message };

    const profiles = profilesRes.data ?? [];
    const roleCounts: Record<string, number> = {};
    for (const p of profiles) {
      const role = (p.role as string) ?? "user";
      roleCounts[role] = (roleCounts[role] ?? 0) + 1;
    }

    const questsByBusiness = new Map<string, number>();
    for (const q of questsRes.data ?? []) {
      const id = q.business_id as string | null;
      if (id) questsByBusiness.set(id, (questsByBusiness.get(id) ?? 0) + 1);
    }

    const businesses: OverviewBusiness[] = (businessesRes.data ?? []).map((b) => {
      const owner = b.profiles as unknown as { display_name: string | null; email: string | null } | null;
      return {
        id: b.id as string,
        name: b.name as string,
        city: (b.city as string | null) ?? null,
        address: (b.address as string | null) ?? null,
        latitude: (b.latitude as number | null) ?? null,
        longitude: (b.longitude as number | null) ?? null,
        verification_status: String(b.verification_status ?? "pending"),
        merchant_name: owner?.display_name ?? null,
        merchant_email: owner?.email ?? null,
        live_quests: questsByBusiness.get(b.id as string) ?? 0,
        created_at: b.created_at as string,
      };
    });

    return {
      data: {
        roleCounts,
        totalUsers: profiles.length,
        bannedUsers: profiles.filter((p) => p.banned_at).length,
        newUsersThisWeek: profiles.filter((p) => (p.created_at as string) >= weekAgo).length,
        liveQuests: (questsRes.data ?? []).length,
        businesses,
        recentUsers: (recentRes.data ?? []) as OverviewUser[],
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't load the overview." };
  }
}
