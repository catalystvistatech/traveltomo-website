"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
          <p className="text-zinc-400">Loading...</p>
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}

function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [loading, setLoading] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmed = token.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from the email.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    // `type: "signup"` matches the Supabase auth email-confirmation
    // template so the user ends up with an authenticated session on
    // success. The dashboard middleware will then route them based
    // on their role / merchant_request_status.
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: trimmed,
      type: "signup",
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  async function handleResend() {
    if (!email) {
      setError("Enter the email you registered with first.");
      return;
    }
    setError(null);
    setResendState("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setError(error.message);
      setResendState("idle");
      return;
    }

    setResendState("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600">
            <span className="text-xl font-bold text-white">T</span>
          </div>
          <CardTitle className="text-2xl text-white">
            Verify your email
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Enter the 6-digit code we emailed you to finish setting up your
            merchant account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token" className="text-zinc-300">
                Confirmation code
              </Label>
              <Input
                id="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                placeholder="123456"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 tracking-[0.4em] text-center text-lg"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendState === "sending"}
              className="text-red-400 hover:text-red-300 font-medium disabled:opacity-60"
            >
              {resendState === "sending"
                ? "Sending..."
                : resendState === "sent"
                ? "Code sent"
                : "Resend code"}
            </button>
            <Link
              href="/admin/login"
              className="text-zinc-400 hover:text-zinc-200"
            >
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
