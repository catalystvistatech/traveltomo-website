import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminMerchantsPage() {
  const supabase = await createClient();

  const { data: merchants } = await supabase
    .from("profiles")
    .select("id, display_name, role, created_at, businesses(name, city, is_verified)")
    .in("role", ["merchant", "admin"])
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Merchants</h1>
        <p className="text-zinc-400 mt-1">All registered merchants and admins.</p>
      </div>

      <div className="grid gap-4">
        {(merchants ?? []).map((m: Record<string, unknown>) => {
          const businesses = m.businesses as Array<{ name: string; city: string; is_verified: boolean }> | null;
          const biz = businesses?.[0];
          return (
            <Card key={m.id as string} className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white text-lg">
                    {(m.display_name as string) ?? "Unnamed"}
                  </CardTitle>
                  <p className="text-sm text-zinc-400">
                    {biz ? `${biz.name}  ${biz.city}` : "No business profile"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                    {m.role as string}
                  </Badge>
                  {biz?.is_verified && (
                    <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
                      verified
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
