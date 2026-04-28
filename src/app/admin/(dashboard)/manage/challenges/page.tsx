"use client";

import { useEffect, useState } from "react";
import { getAllChallenges, reviewChallenge } from "@/lib/actions/challenges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type Challenge = Record<string, unknown> & {
  id: string;
  title: string;
  type: string;
  xp_reward: number;
  places: Record<string, unknown> | null;
  profiles: Record<string, unknown> | null;
  rewards: Record<string, unknown>[];
};

export default function ManageChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    getAllChallenges("pending_review").then((data) => {
      setChallenges(data as Challenge[]);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  async function handleReview(
    challengeId: string,
    action: "approved" | "rejected"
  ) {
    setLoadingId(challengeId);
    const result = await reviewChallenge(
      challengeId,
      action,
      notes[challengeId]
    );
    setLoadingId(null);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        action === "approved" ? "Challenge approved!" : "Challenge rejected."
      );
      setChallenges((prev) => prev.filter((c) => c.id !== challengeId));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Approval Queue</h1>
        <p className="text-zinc-400 mt-1">
          Review and approve merchant challenges.
        </p>
      </div>

      {challenges.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShieldCheck className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">All clear!</h3>
            <p className="text-zinc-400 mt-1">
              No challenges pending review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {challenges.map((challenge) => (
            <Card
              key={challenge.id}
              className="bg-zinc-900 border-zinc-800"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-white">
                      {challenge.title}
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                      {challenge.profiles
                        ? (challenge.profiles.display_name as string)
                        : "Unknown merchant"}{" "}
                      -{" "}
                      {challenge.places
                        ? (challenge.places.name as string)
                        : "No location"}
                    </CardDescription>
                  </div>
                  <Badge className="bg-yellow-600/20 text-yellow-400">
                    pending review
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-zinc-500">Type</p>
                    <p className="text-white">{challenge.type}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">XP Reward</p>
                    <p className="text-white">{challenge.xp_reward}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Rewards</p>
                    <p className="text-white">
                      {challenge.rewards?.length ?? 0}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder="Admin notes (optional)"
                    value={notes[challenge.id] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [challenge.id]: e.target.value,
                      }))
                    }
                    rows={2}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleReview(challenge.id, "approved")}
                    disabled={loadingId === challenge.id}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReview(challenge.id, "rejected")}
                    disabled={loadingId === challenge.id}
                    className="border-red-600 text-red-400 hover:bg-red-600/10"
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
