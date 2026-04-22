import { notFound } from "next/navigation";
import { getChallenge, submitChallengeForReview } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "./submit-button";

const statusColors: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-300",
  pending_review: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  approved: "bg-blue-600/20 text-blue-400 border-blue-600/30",
  rejected: "bg-red-600/20 text-red-400 border-red-600/30",
  live: "bg-green-600/20 text-green-400 border-green-600/30",
  paused: "bg-orange-600/20 text-orange-400 border-orange-600/30",
};

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) notFound();

  const place = challenge.places as { name: string; latitude: number; longitude: number } | null;
  const rewards = (challenge.rewards ?? []) as Array<{
    id: string;
    title: string;
    discount_type: string;
    discount_value: number;
    max_redemptions: number;
    current_redemptions: number;
  }>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{challenge.title}</h1>
          <p className="text-zinc-400 mt-1">
            {challenge.type} &middot; {challenge.xp_reward} XP
          </p>
        </div>
        <Badge className={statusColors[challenge.status] ?? statusColors.draft}>
          {challenge.status.replace("_", " ")}
        </Badge>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Description" value={challenge.description} />
          <Row label="Instructions" value={challenge.instructions} />
          <Row label="Place" value={place?.name} />
          <Row label="Verification" value={challenge.verification_type} />
          <Row label="Radius" value={`${challenge.radius_meters}m`} />
          {challenge.admin_notes && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-600/10 border border-yellow-600/20">
              <p className="text-yellow-400 text-xs font-medium mb-1">Admin Notes</p>
              <p className="text-zinc-300 text-sm">{challenge.admin_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {rewards.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Rewards</CardTitle>
          </CardHeader>
          <CardContent>
            {rewards.map((r) => (
              <div key={r.id} className="flex justify-between items-center">
                <div>
                  <p className="text-white font-medium">{r.title}</p>
                  <p className="text-zinc-400 text-sm">
                    {r.discount_type === "freebie"
                      ? "Freebie"
                      : `${r.discount_value}${r.discount_type === "percentage" ? "%" : " PHP"} off`}
                  </p>
                </div>
                <p className="text-zinc-500 text-sm">
                  {r.current_redemptions}/{r.max_redemptions} redeemed
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {challenge.status === "draft" && (
        <SubmitButton challengeId={challenge.id} action={submitChallengeForReview} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between border-b border-zinc-800 pb-2">
      <span className="text-zinc-400">{label}</span>
      <span className="text-white text-right max-w-[60%]">{value}</span>
    </div>
  );
}
