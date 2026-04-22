import Link from "next/link";
import { getMerchantChallenges } from "@/lib/actions/challenges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trophy } from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  pending_review: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  approved: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rejected: "bg-red-600/20 text-red-400 border-red-600/30",
  live: "bg-green-600/20 text-green-400 border-green-600/30",
  paused: "bg-orange-600/20 text-orange-400 border-orange-600/30",
};

export default async function ChallengesPage() {
  const challenges = await getMerchantChallenges();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenges</h1>
          <p className="text-zinc-400 mt-1">Manage your travel challenges.</p>
        </div>
        <Link href="/challenges/new">
          <Button className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            New Challenge
          </Button>
        </Link>
      </div>

      {challenges.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Trophy className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No challenges yet
            </h3>
            <p className="text-zinc-400 mb-4 text-center">
              Create your first challenge to start engaging travelers.
            </p>
            <Link href="/challenges/new">
              <Button className="bg-red-600 hover:bg-red-700">Create Challenge</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {challenges.map((challenge: Record<string, unknown>) => (
            <Link key={challenge.id as string} href={`/challenges/${challenge.id}`}>
              <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-white text-lg">
                      {challenge.title as string}
                    </CardTitle>
                    <p className="text-sm text-zinc-400">
                      {challenge.type as string} &middot; {challenge.xp_reward as number} XP
                      {(challenge.places as { name: string } | null)?.name &&
                        ` -- ${(challenge.places as { name: string }).name}`}
                    </p>
                  </div>
                  <Badge
                    className={
                      statusColors[challenge.status as string] ?? statusColors.draft
                    }
                  >
                    {(challenge.status as string).replace("_", " ")}
                  </Badge>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
