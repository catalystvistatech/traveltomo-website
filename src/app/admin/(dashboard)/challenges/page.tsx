import { getMerchantChallenges } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trophy } from "lucide-react";
import Link from "next/link";

const statusColors: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  pending_review: "bg-yellow-600/20 text-yellow-400",
  live: "bg-green-600/20 text-green-400",
  approved: "bg-green-600/20 text-green-400",
  rejected: "bg-red-600/20 text-red-400",
  paused: "bg-orange-600/20 text-orange-400",
};

export default async function ChallengesPage() {
  const challenges = await getMerchantChallenges();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenges</h1>
          <p className="text-zinc-400 mt-1">
            Create and manage challenges for travelers.
          </p>
        </div>
        <Link href="/admin/challenges/new">
          <Button className="bg-red-600 hover:bg-red-700">
            <Plus className="h-4 w-4 mr-2" />
            New Challenge
          </Button>
        </Link>
      </div>

      {challenges.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">
              No challenges yet
            </h3>
            <p className="text-zinc-400 mt-1 text-center">
              Create your first challenge to start attracting travelers.
            </p>
            <Link href="/admin/challenges/new">
              <Button className="mt-4 bg-red-600 hover:bg-red-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Challenge
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {challenges.map(
            (challenge: Record<string, unknown>) => {
              const status = challenge.status as string;
              const places = challenge.places as Record<string, unknown> | null;
              const rewards = challenge.rewards as Record<string, unknown>[] | null;

              return (
                <Link
                  key={challenge.id as string}
                  href={`/admin/challenges/${challenge.id}`}
                >
                  <Card className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer h-full">
                    <CardHeader className="flex flex-row items-start justify-between">
                      <div className="space-y-1 min-w-0 flex-1">
                        <CardTitle className="text-white truncate">
                          {challenge.title as string}
                        </CardTitle>
                        <p className="text-xs text-zinc-500">
                          {places
                            ? (places.name as string)
                            : "No location"}{" "}
                          - {challenge.type as string}
                        </p>
                      </div>
                      <Badge
                        className={
                          statusColors[status] ?? "bg-zinc-700 text-zinc-200"
                        }
                      >
                        {status.replace("_", " ")}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-zinc-400 line-clamp-2">
                        {(challenge.description as string) ?? "No description"}
                      </p>
                      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                        <span>{challenge.xp_reward as number} XP</span>
                        <span>
                          {rewards?.length ?? 0}{" "}
                          {(rewards?.length ?? 0) === 1 ? "reward" : "rewards"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}
