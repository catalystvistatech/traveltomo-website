import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  if (user.role === "user") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-zinc-400">
            This dashboard is for merchants and admins only.
          </p>
          <p className="text-zinc-500 text-sm">
            Contact support to upgrade your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-4">
          <SidebarTrigger className="text-zinc-400 hover:text-white" />
          <Separator orientation="vertical" className="h-4 bg-zinc-700" />
          <div className="flex-1" />
          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
            {user.role}
          </Badge>
        </header>
        <main className="flex-1 bg-zinc-950 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
