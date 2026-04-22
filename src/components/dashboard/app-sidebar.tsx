"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Store, Trophy, Gift, BarChart3,
  Shield, ShieldCheck, MapPin, Users, LogOut, ListChecks, CheckCircle2, Megaphone, FileStack,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/actions/auth";
import type { UserProfile } from "@/lib/actions/auth";

const merchantNav = [
  { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { title: "Business Profile", href: "/admin/business", icon: Store },
  { title: "Travel Challenges", href: "/admin/travel-challenges", icon: Trophy },
  { title: "Template Library", href: "/admin/template-library", icon: FileStack },
  { title: "Verify Completions", href: "/admin/completions", icon: CheckCircle2 },
  { title: "Promote", href: "/admin/promote", icon: Megaphone },
  { title: "Rewards", href: "/admin/rewards", icon: Gift },
  { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
];

const adminNav = [
  { title: "Business Verification", href: "/admin/manage/businesses", icon: Shield },
  { title: "Travel Challenge Reviews", href: "/admin/manage/travel-challenges", icon: ShieldCheck },
  { title: "Challenge Approvals", href: "/admin/manage/challenges", icon: ListChecks },
  { title: "Templates", href: "/admin/templates", icon: FileStack },
  { title: "Merchants", href: "/admin/manage/merchants", icon: Users },
  { title: "Places", href: "/admin/manage/places", icon: MapPin },
];

export function AppSidebar({ user }: { user: UserProfile }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <Sidebar className="border-zinc-800">
      <SidebarHeader className="border-b border-zinc-800 p-4">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600">
            <span className="text-sm font-bold text-white">T</span>
          </div>
          <span className="text-lg font-bold text-white">TravelTomo</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-zinc-500">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {merchantNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton isActive={pathname === item.href} render={<Link href={item.href} />}>
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {(user.role === "admin" || user.role === "superadmin") && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-zinc-500">Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={pathname === item.href} render={<Link href={item.href} />}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-zinc-800 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-white">
            {(user.display_name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-medium text-white truncate">{user.display_name ?? "Merchant"}</p>
            <p className="text-xs text-zinc-400 truncate">{user.email}</p>
          </div>
          <button onClick={handleSignOut} className="text-zinc-400 hover:text-white transition-colors" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
