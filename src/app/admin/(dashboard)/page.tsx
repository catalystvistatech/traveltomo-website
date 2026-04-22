import { getCurrentUser } from "@/lib/actions/auth";
import { getMerchantChallenges } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Eye, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const challenges = await getMerchantChallenges();

  const stats = {
    total: challenges.length,
    live: challenges.filter((c: { status: string }) => c.status === "live").length,
    pending: challenges.filter((c: { status: string }) => c.status === "pending_review").length,
    draft: challenges.filter((c: { status: string }) => c.status === "draft").length,
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Welcome back, {user?.display_name ?? "Merchant"}</h1>
        <p className="text-zinc-400 mt-1">Here is an overview of your challenges and activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Challenges" value={stats.total} icon={<Trophy className="h-4 w-4 text-zinc-500" />} />
        <StatCard title="Live" value={stats.live} icon={<Eye className="h-4 w-4 text-green-500" />} color="text-green-400" />
        <StatCard title="Pending Review" value={stats.pending} icon={<Clock className="h-4 w-4 text-yellow-500" />} color="text-yellow-400" />
        <StatCard title="Drafts" value={stats.draft} icon={<CheckCircle className="h-4 w-4 text-zinc-500" />} color="text-zinc-300" />
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader><CardTitle className="text-white">Quick Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/admin/challenges/new"><Button className="bg-red-600 hover:bg-red-700">Create Challenge</Button></Link>
          <Link href="/admin/business"><Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">Edit Business Profile</Button></Link>
          <Link href="/admin/analytics"><Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">View Analytics</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon, color = "text-white" }: { title: string; value: number; icon: React.ReactNode; color?: string }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent><div className={`text-2xl font-bold ${color}`}>{value}</div></CardContent>
    </Card>
  );
}
