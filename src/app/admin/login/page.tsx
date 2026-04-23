"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dedicated "needs to verify email" state so users aren't staring at
  // a cryptic red banner with no way forward.
  const [needsVerify, setNeedsVerify] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (isEmailNotConfirmedError(error)) {
        setPendingEmail(email);
        setNeedsVerify(true);
        setLoading(false);
        return;
      }

      // Supabase now returns `invalid_credentials` for unconfirmed
      // accounts too (to prevent email enumeration), so we can't
      // always tell "wrong password" from "needs to confirm". Surface
      // both possibilities rather than leaving the user stuck.
      setError(
        isInvalidCredentialsError(error)
          ? "Wrong email or password. If you just registered, your email may not be confirmed yet — enter your 6-digit code below."
          : error.message,
      );
      setLoading(false);
      return;
    }

    router.push("/admin");
    router.refresh();
  }

  async function handleResend() {
    if (!pendingEmail) return;
    setError(null);
    setResendState("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
    });

    if (error) {
      setError(error.message);
      setResendState("idle");
      return;
    }

    setResendState("sent");
  }

  if (needsVerify) {
    const verifyHref = `/admin/verify?email=${encodeURIComponent(pendingEmail)}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600">
              <span className="text-xl font-bold text-white">T</span>
            </div>
            <CardTitle className="text-2xl text-white">
              Confirm your email
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Your account{" "}
              <strong className="text-white">{pendingEmail}</strong> exists but
              isn&apos;t verified yet. Enter the 6-digit code we emailed you to
              finish signing in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button
              onClick={() => router.push(verifyHref)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Enter confirmation code
            </Button>
            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resendState === "sending"}
              className="w-full bg-transparent border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              {resendState === "sending"
                ? "Sending…"
                : resendState === "sent"
                ? "Code resent — check your email"
                : "Resend code"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setNeedsVerify(false);
                setResendState("idle");
                setError(null);
              }}
              className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-600">
            <span className="text-xl font-bold text-white">T</span>
          </div>
          <CardTitle className="text-2xl text-white">Welcome back</CardTitle>
          <CardDescription className="text-zinc-400">
            Sign in to the TravelTomo dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-zinc-300">Email</Label>
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
              <Label htmlFor="password" className="text-zinc-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-md">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          {/* Persistent escape hatch: Supabase reports unconfirmed
              accounts as `invalid_credentials` now, so this link is the
              only reliable way for a merchant who registered but never
              opened the email to complete verification. */}
          <p className="mt-4 text-center text-sm text-zinc-400">
            Haven&apos;t confirmed your email?{" "}
            <Link
              href={
                email
                  ? `/admin/verify?email=${encodeURIComponent(email)}`
                  : "/admin/verify"
              }
              className="text-red-400 hover:text-red-300 font-medium"
            >
              Enter your code
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-zinc-400">
            New merchant?{" "}
            <Link href="/admin/register" className="text-red-400 hover:text-red-300 font-medium">
              Register here
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Supabase reports unconfirmed email differently depending on version:
// - `error.code === "email_not_confirmed"` (newer supabase-js)
// - `error.message` containing "Email not confirmed" (older versions)
// Accept either so the branch is version-robust.
function isEmailNotConfirmedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown };
  if (typeof err.code === "string" && err.code === "email_not_confirmed") {
    return true;
  }
  if (
    typeof err.message === "string" &&
    err.message.toLowerCase().includes("email not confirmed")
  ) {
    return true;
  }
  return false;
}

// Recent Supabase builds collapse "wrong password" and "account not
// confirmed" into a single `invalid_credentials` error to prevent
// email enumeration, so we can't reliably differentiate them from the
// server response. Detect the generic case and hint at both causes.
function isInvalidCredentialsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown };
  if (typeof err.code === "string" && err.code === "invalid_credentials") {
    return true;
  }
  if (
    typeof err.message === "string" &&
    err.message.toLowerCase().includes("invalid login credentials")
  ) {
    return true;
  }
  return false;
}
