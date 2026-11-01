"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listActAsMerchants, startActAs } from "@/lib/actions/actAs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert } from "lucide-react";

type Merchant = { id: string; display_name: string | null; email: string | null };

/**
 * Superadmin entry point for "act as merchant".
 *
 * The reason field is mandatory and is quoted back to the merchant in their
 * notification — it is the transparency record that makes this defensible
 * when the merchant is unresponsive and cannot grant access up front.
 */
export default function ActAsPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    listActAsMerchants().then((m) => setMerchants(m as Merchant[]));
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Act as a merchant</h1>
        <p className="text-zinc-400 mt-1">
          Edit a merchant&apos;s quests on their behalf — without their login.
        </p>
      </div>

      <div className="flex gap-3 rounded-lg border border-amber-800/60 bg-amber-950/40 p-4 text-sm text-amber-100">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
        <div className="space-y-1">
          <p>
            You stay signed in as yourself. Every change is recorded against
            your account, and the merchant is notified and can review what was
            changed.
          </p>
          <p className="text-amber-300/80">
            Sessions end automatically after 60 minutes.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Merchant</Label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white"
        >
          <option value="">Select a merchant…</option>
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.display_name || m.email || m.id}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">
          Reason <span className="text-zinc-500">(shown to the merchant)</span>
        </Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Merchant asked us to fix their quest stops over chat"
          className="bg-zinc-800 border-zinc-700 text-white"
        />
        <p className="text-xs text-zinc-500">
          At least 10 characters. This is your record of why access was needed.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <Button
        disabled={pending || !selected || reason.trim().length < 10}
        className="bg-red-600 text-white hover:bg-red-700"
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startActAs(selected, reason);
            if ("error" in res && res.error) {
              setError(res.error);
              return;
            }
            router.push("/admin/travel-challenges");
            router.refresh();
          })
        }
      >
        {pending ? "Starting…" : "Start acting as this merchant"}
      </Button>
    </div>
  );
}
