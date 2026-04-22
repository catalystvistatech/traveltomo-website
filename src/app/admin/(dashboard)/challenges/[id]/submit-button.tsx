"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitChallengeForReview } from "@/lib/actions/challenges";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SubmitButton({ challengeId }: { challengeId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    setLoading(true);
    const result = await submitChallengeForReview(challengeId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Challenge submitted for review");
      router.refresh();
    }
  }

  return (
    <Button
      onClick={handleSubmit}
      disabled={loading}
      className="bg-red-600 hover:bg-red-700"
    >
      {loading ? "Submitting..." : "Submit for Review"}
    </Button>
  );
}
