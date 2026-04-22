import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getCurrentUser,
  signOut,
  requestMerchantAccess,
  type UserProfile,
} from "@/lib/actions/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogOut, Store, ArrowLeft, Clock, XCircle, PauseCircle } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/admin/login");

  if (user.role === "user") {
    return <AccessDeniedScreen user={user} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4">
          <SidebarTrigger className="text-zinc-400 hover:text-white" />
          <Separator orientation="vertical" className="h-4 bg-zinc-700" />
          <div className="flex-1" />
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">{user.role}</Badge>
        </header>
        <main className="flex-1 bg-zinc-950 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function AccessDeniedScreen({ user }: { user: UserProfile }) {
  const status = user.merchant_request_status ?? "none";

  async function handleSignOut() {
    "use server";
    await signOut();
    redirect("/admin/login");
  }

  async function handleRequestMerchant() {
    "use server";
    await requestMerchantAccess();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Merchant access required</h1>
          <p className="text-sm text-zinc-400">
            The <span className="font-mono">/admin</span> dashboard is for approved
            merchants and admins only. Your account is currently a traveler.
          </p>
        </header>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold">
              {(user.display_name ?? user.email)[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {user.display_name ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-zinc-400">{user.email}</p>
            </div>
          </div>
        </div>

        <MerchantRequestPanel
          status={status}
          requestAction={handleRequestMerchant}
        />

        <form action={handleSignOut} className="flex flex-col gap-2">
          <Button
            type="submit"
            variant="outline"
            className="w-full border-zinc-700 text-white hover:bg-zinc-800"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </form>

        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-white"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to traveltomo.app
          </Link>
        </div>
      </div>
    </div>
  );
}

function MerchantRequestPanel({
  status,
  requestAction,
}: {
  status: string;
  requestAction: () => Promise<void>;
}) {
  if (status === "pending") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-yellow-900/60 bg-yellow-900/10 p-4 text-sm text-yellow-300">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Merchant application submitted</p>
          <p className="text-xs text-yellow-400/80">
            An admin will review your request and upgrade your account soon.
          </p>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-900/60 bg-red-900/10 p-4 text-sm text-red-300">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Merchant application rejected</p>
          <p className="text-xs text-red-400/80">
            Contact support if you think this was a mistake.
          </p>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Merchant access suspended</p>
          <p className="text-xs text-zinc-400">
            Your merchant role was paused by an admin. Reach out to support to
            restore access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={requestAction} className="space-y-2">
      <Button
        type="submit"
        className="w-full bg-red-600 text-white hover:bg-red-700"
      >
        <Store className="mr-2 h-4 w-4" />
        Request merchant access
      </Button>
      <p className="text-center text-xs text-zinc-500">
        Applications are reviewed by a TravelTomo admin.
      </p>
    </form>
  );
}
