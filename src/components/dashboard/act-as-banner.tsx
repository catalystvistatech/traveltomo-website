"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopActAs } from "@/lib/actions/actAs";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

/**
 * Persistent, non-dismissible banner shown while a superadmin is acting as a
 * merchant.
 *
 * This is an honesty device, never an enforcement boundary — every actual
 * check lives server-side in the scope resolver. Its job is to make sure an
 * operator can never forget whose data they are editing, and to state plainly
 * that the merchant can see what they do.
 */
export function ActAsBanner({
  merchantName,
  expiresAt,
}: {
  merchantName: string | null;
  expiresAt: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  // Ticked from an effect rather than read during render: reading the clock
  // while rendering is impure, and a value frozen at first paint would drift
  // out of date on a long-lived page anyway.
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () =>
      setMinutesLeft(
        Math.max(
          0,
          Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000)
        )
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-700/60 bg-amber-950/70 px-4 py-2.5 text-sm">
      <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      <span className="text-amber-100">
        Acting as{" "}
        <strong className="font-semibold text-white">
          {merchantName ?? "merchant"}
        </strong>
        . Changes are recorded and attributed to you, and this merchant can see
        them.
      </span>
      {minutesLeft !== null && (
        <span className="text-amber-300/80">Ends in {minutesLeft} min</span>
      )}
      <div className="flex-1" />
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        className="border-amber-600 bg-amber-900/40 text-amber-100 hover:bg-amber-900"
        onClick={() =>
          start(async () => {
            await stopActAs();
            router.refresh();
          })
        }
      >
        {pending ? "Exiting…" : "Exit"}
      </Button>
    </div>
  );
}
