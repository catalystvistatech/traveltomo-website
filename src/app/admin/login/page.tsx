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

  async function handleOAuth(provider: "google" | "apple") {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/admin/auth/callback?next=/admin`,
      },
    });
    // On success the browser is redirected to the provider, so we only
    // reach here when starting the flow failed.
    if (error) {
      setError(error.message);
      setLoading(false);
    }
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

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-500">Or continue with</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOAuth("google")}
              className="w-full bg-transparent border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-white gap-2"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOAuth("apple")}
              className="w-full bg-transparent border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-white gap-2"
            >
              <AppleIcon />
              Continue with Apple
            </Button>
          </div>
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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-2.6-11.3-6.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.8 35.7 44 30.3 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C73.3 141.2 24 184.5 24 273.5c0 26.3 4.8 53.5 14.4 81.5 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-92.2zM262.6 89.5c25.5-30.3 23.2-57.9 22.5-67.8-22.6 1.3-48.7 15.4-63.6 32.8-16.4 18.8-26 41.9-23.9 67.3 24.4 1.9 46.7-10.5 65-32.3z" />
    </svg>
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
