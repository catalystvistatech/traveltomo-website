"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Gift, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupCode, redeemCode, type CodePreview } from "@/lib/actions/redeemCode";

/**
 * "Customer showing a code?" — the one thing staff do at the counter.
 * Accepts any TravelTomo code (stop reward, big reward, stamp freebie),
 * previews who it is and what to give, then hands it over in one tap.
 */
export function RedeemCodeBox() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setCode("");
    setPreview(null);
    setError(null);
  }

  return (
    <Card className="border-red-900/50 bg-zinc-900">
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-red-400" />
          <p className="text-lg font-semibold text-white">Customer showing a code?</p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setPreview(null);
            start(async () => {
              const r = await lookupCode(code);
              if ("error" in r) setError(r.error);
              else setPreview(r.preview);
            });
          }}
        >
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setPreview(null);
              setError(null);
            }}
            placeholder="e.g. K7Q2XM or TT-SC-1A2B3C"
            aria-label="Customer's code"
            autoCapitalize="characters"
            autoComplete="off"
            className="h-12 max-w-sm border-zinc-700 bg-zinc-800 font-mono text-lg tracking-wider text-white"
          />
          <Button
            type="submit"
            disabled={pending || code.trim().length < 4}
            className="h-12 bg-red-600 px-6 text-white hover:bg-red-700"
          >
            {pending && !preview ? "Checking…" : "Check code"}
          </Button>
        </form>

        {error && (
          <p className="flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        {preview && (
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4 sm:flex-row">
            {preview.proofUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.proofUrl} alt="Traveler's photo proof" className="h-28 w-28 rounded-lg object-cover" />
            )}
            <div className="flex-1 space-y-1">
              <p className="text-sm text-zinc-400">{preview.context}</p>
              <p className="text-xl font-bold text-white">{preview.reward}</p>
              <p className="text-sm text-zinc-300">for {preview.traveler}</p>
              {preview.done && (
                <p className="flex items-center gap-1.5 pt-1 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> Already given out.
                </p>
              )}
              {!preview.done && preview.blockedReason && (
                <p className="pt-1 text-sm text-amber-300">{preview.blockedReason}</p>
              )}
            </div>
            <div className="flex items-end gap-2">
              {!preview.done && !preview.blockedReason && (
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await redeemCode(preview.code);
                      if ("error" in r) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success(r.message);
                      reset();
                      router.refresh();
                    })
                  }
                  className="h-12 bg-green-600 px-6 text-white hover:bg-green-700"
                >
                  {pending ? "Saving…" : "Give reward"}
                </Button>
              )}
              <Button variant="outline" onClick={reset} className="h-12 border-zinc-700 text-zinc-300">
                {preview.done || preview.blockedReason ? "OK" : "Cancel"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
