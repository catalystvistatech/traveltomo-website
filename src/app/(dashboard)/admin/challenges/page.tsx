"use client";

import { useEffect, useState } from "react";
import { getAllChallenges, reviewChallenge } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Challenge = {
  id: string;
  title: string;
  type: string;
  status: string;
  xp_reward: number;
  merchant_id: string;
  created_at: string;
  profiles?: { display_name: string | null };
  places?: { name: string } | null;
};

export default function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAllChallenges("pending_review").then((data) =>
      setChallenges(data as Challenge[])
    );
  }, []);

  async function handleReview(id: string, action: "approved" | "rejected") {
    setLoading((prev) => ({ ...prev, [id]: true }));
    const result = await reviewChallenge(id, action, notes[id]);
    setLoading((prev) => ({ ...prev, [id]: false }));

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(`Challenge ${action}`);
      setChallenges((prev) => prev.filter((c) => c.id !== id));
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
          <CardContent className="py-12 text-center">
            <p className="text-zinc-400">No challenges pending review.</p>
          </CardContent>
        </Card>
      ) : (
        challenges.map((ch) => (
          <Card key={ch.id} className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white">{ch.title}</CardTitle>
                <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
                  pending review
                </Badge>
              </div>
              <p className="text-sm text-zinc-400">
                {ch.type} &middot; {ch.xp_reward} XP &middot; by{" "}
                {ch.profiles?.display_name ?? "Unknown"} &middot;{" "}
                {ch.places?.name ?? "No place"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Admin notes (optional)..."
                value={notes[ch.id] ?? ""}
                onChange={(e) =>
                  setNotes((prev) => ({ ...prev, [ch.id]: e.target.value }))
                }
                rows={2}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <div className="flex gap-3">
                <Button
                  onClick={() => handleReview(ch.id, "approved")}
                  disabled={loading[ch.id]}
                  className="bg-green-600 hover:bg-green-700 text-white flex-1"
                >
                  Approve & Go Live
                </Button>
                <Button
                  onClick={() => handleReview(ch.id, "rejected")}
                  disabled={loading[ch.id]}
                  variant="outline"
                  className="border-red-600/50 text-red-400 hover:bg-red-600/10 flex-1"
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
