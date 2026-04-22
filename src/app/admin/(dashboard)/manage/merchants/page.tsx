import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

export default async function ManageMerchantsPage() {
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, role, display_name, avatar_url, created_at, businesses(*)")
    .in("role", ["merchant", "admin"])
    .order("created_at", { ascending: false });

  const profilesList = (profiles ?? []) as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Merchants & Admins</h1>
        <p className="text-zinc-400 mt-1">
          View all merchants and admins in the system.
        </p>
      </div>

      {profilesList.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">
              No merchants yet
            </h3>
            <p className="text-zinc-400 mt-1">
              Merchants will appear here after they register.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profilesList.map((profile) => {
            const businesses = (profile.businesses ?? []) as Record<string, unknown>[];
            const biz = businesses[0] ?? null;

            return (
              <Card
                key={profile.id as string}
                className="bg-zinc-900 border-zinc-800"
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-white truncate">
                      {(profile.display_name as string) ?? "No name"}
                    </CardTitle>
                    {biz && (
                      <p className="text-xs text-zinc-500">
                        {biz.name as string}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      (profile.role as string) === "admin"
                        ? "bg-red-600/20 text-red-400"
                        : "bg-blue-600/20 text-blue-400"
                    }
                  >
                    {profile.role as string}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {biz ? (
                    <div className="space-y-2 text-sm">
                      {(biz.category as string | null) && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Category:</span>
                          <span className="text-zinc-300">
                            {biz.category as string}
                          </span>
                        </div>
                      )}
                      {(biz.city as string | null) && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">City:</span>
                          <span className="text-zinc-300">
                            {biz.city as string}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Verified:</span>
                        <Badge
                          className={
                            biz.is_verified
                              ? "bg-green-600/20 text-green-400"
                              : "bg-zinc-700 text-zinc-300"
                          }
                        >
                          {biz.is_verified ? "Yes" : "No"}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      No business profile yet
                    </p>
                  )}
                  <p className="text-xs text-zinc-600 mt-3">
                    Joined{" "}
                    {new Date(
                      profile.created_at as string
                    ).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
