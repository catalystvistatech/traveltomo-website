"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name, requested_role: "merchant" } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    const verifyHref = `/admin/verify?email=${encodeURIComponent(email)}`;
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
        <Card className="w-full max-w-md bg-zinc-900 border-zinc-800">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white">Check your email</CardTitle>
            <CardDescription className="text-zinc-400">
              We sent a 6-digit confirmation code to <strong className="text-white">{email}</strong>. After you verify, your merchant account will remain pending until admin verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              onClick={() => router.push(verifyHref)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              Enter confirmation code
            </Button>
            <Button
              variant="ghost"
              onClick={() => router.push("/admin/login")}
              className="w-full text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Back to login
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
          <CardTitle className="text-2xl text-white">Create an account</CardTitle>
          <CardDescription className="text-zinc-400">Register as a TravelTomo merchant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500" placeholder="Juan Dela Cruz" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500" placeholder="you@business.com" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500" placeholder="Min 6 characters" />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-md">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white">
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link href="/admin/login" className="text-red-400 hover:text-red-300 font-medium">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
