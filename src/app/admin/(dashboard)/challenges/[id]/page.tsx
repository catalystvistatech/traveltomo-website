import { getChallenge } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";
import Link from "next/link";

const statusColors: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-200",
  pending_review: "bg-yellow-600/20 text-yellow-400",
  live: "bg-green-600/20 text-green-400",
  approved: "bg-green-600/20 text-green-400",
  rejected: "bg-red-600/20 text-red-400",
  paused: "bg-orange-600/20 text-orange-400",
};

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const challenge = await getChallenge(id);

  if (!challenge) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">
            Challenge not found
          </h2>
          <p className="text-zinc-400 mt-2">
            This challenge may have been deleted.
          </p>
          <Link href="/admin/challenges">
            <Button
              variant="outline"
              className="mt-4 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Back to Challenges
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const status = challenge.status as string;
  const places = challenge.places as Record<string, unknown> | null;
  const rewards = (challenge.rewards ?? []) as Record<string, unknown>[];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">
              {challenge.title}
            </h1>
            <Badge className={statusColors[status] ?? "bg-zinc-700 text-zinc-200"}>
              {status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-zinc-400 mt-1">
            {places ? (places.name as string) : "No location"} -{" "}
            {challenge.type}
          </p>
        </div>
        <Link href="/admin/challenges">
          <Button
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            Back
          </Button>
        </Link>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {challenge.description && (
            <div>
              <p className="text-sm text-zinc-500">Description</p>
              <p className="text-zinc-200">{challenge.description}</p>
            </div>
          )}
          {challenge.instructions && (
            <div>
              <p className="text-sm text-zinc-500">Instructions</p>
              <p className="text-zinc-200">{challenge.instructions}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-zinc-500">Type</p>
              <p className="text-white">{challenge.type}</p>
            </div>
            <div>
              <p className="text-zinc-500">XP Reward</p>
              <p className="text-white">{challenge.xp_reward}</p>
            </div>
            <div>
              <p className="text-zinc-500">Radius</p>
              <p className="text-white">{challenge.radius_meters}m</p>
            </div>
          </div>
          {challenge.verification_type && (
            <div>
              <p className="text-sm text-zinc-500">Verification</p>
              <p className="text-zinc-200">{challenge.verification_type}</p>
            </div>
          )}
          {challenge.quiz_question && (
            <div>
              <p className="text-sm text-zinc-500">Quiz Question</p>
              <p className="text-zinc-200">{challenge.quiz_question}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {rewards.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Rewards</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rewards.map((rw) => (
              <div
                key={rw.id as string}
                className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-white">
                    {rw.title as string}
                  </h4>
                  <Badge className="bg-zinc-700 text-zinc-200">
                    {rw.discount_type as string}
                  </Badge>
                </div>
                {(rw.description as string | null) && (
                  <p className="text-sm text-zinc-400 mt-1">
                    {rw.description as string}
                  </p>
                )}
                <div className="flex gap-4 mt-2 text-xs text-zinc-500">
                  {rw.discount_value != null && (
                    <span>
                      Value:{" "}
                      {(rw.discount_type as string) === "percentage"
                        ? `${rw.discount_value}%`
                        : `$${rw.discount_value}`}
                    </span>
                  )}
                  {rw.max_redemptions != null && (
                    <span>Max: {rw.max_redemptions as number}</span>
                  )}
                  <span>
                    Redeemed: {(rw.current_redemptions as number) ?? 0}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {challenge.admin_notes && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Admin Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-zinc-300">{challenge.admin_notes}</p>
          </CardContent>
        </Card>
      )}

      {status === "draft" && (
        <div className="flex justify-end">
          <SubmitButton challengeId={id} />
        </div>
      )}
    </div>
  );
}
