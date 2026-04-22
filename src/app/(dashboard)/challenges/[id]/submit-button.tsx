"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SubmitButton({
  challengeId,
  action,
}: {
  challengeId: string;
  action: (id: string) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    setLoading(true);
    const result = await action(challengeId);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Submitted for review!");
      router.refresh();
    }
  }

  return (
    <Button
      onClick={handleSubmit}
      disabled={loading}
      className="w-full bg-red-600 hover:bg-red-700 text-white"
    >
      {loading ? "Submitting..." : "Submit for Review"}
    </Button>
  );
}
