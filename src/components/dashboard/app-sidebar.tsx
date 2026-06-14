"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Trophy,
  Gift,
  BarChart3,
  Shield,
  ShieldCheck,
  MapPin,
  Users,
  LogOut,
  ListChecks,
  CheckCircle2,
  Megaphone,
  FileStack,
  Inbox,
  History,
  CreditCard,
  Search,
  HelpCircle,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/actions/auth";
import type { UserProfile } from "@/lib/actions/auth";

type NavItem = {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};
type NavGroup = { label: string; items: NavItem[] };

export function AppSidebar({ user }: { user: UserProfile }) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  const isStaff = user.role === "admin" || user.role === "superadmin";

  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard }],
    },
    {
      label: "Manage Business",
      items: [
        { title: "Profile", href: "/admin/business", icon: Store },
        { title: "Challenges", href: "/admin/travel-challenges", icon: Trophy },
        { title: "Templates", href: "/admin/template-library", icon: FileStack },
        { title: "Verifications", href: "/admin/completions", icon: CheckCircle2 },
        { title: "Claim History", href: "/admin/claims", icon: History },
        { title: "Promotions", href: "/admin/promote", icon: Megaphone },
        { title: "Rewards", href: "/admin/rewards", icon: Gift },
        ...(!isStaff
          ? [{ title: "Billing", href: "/admin/billing", icon: CreditCard }]
          : []),
      ],
    },
    {
      label: "Insights",
      items: [
        { title: "Analytics", href: "/admin/analytics", icon: BarChart3 },
        { title: "Inbox", href: "/admin/inbox", icon: Inbox },
      ],
    },
  ];

  const adminGroup: NavGroup = {
    label: "Administration",
    items: [
      { title: "Users", href: "/admin/manage/users", icon: Users },
      { title: "Business Verification", href: "/admin/manage/businesses", icon: Shield },
      { title: "Quest Reviews", href: "/admin/manage/travel-challenges", icon: ShieldCheck },
      { title: "Challenge Approvals", href: "/admin/manage/challenges", icon: ListChecks },
      { title: "Templates", href: "/admin/templates", icon: FileStack },
      { title: "Merchants", href: "/admin/manage/merchants", icon: Users },
      { title: "Places", href: "/admin/manage/places", icon: MapPin },
    ],
  };

  const allGroups = isStaff ? [...groups, adminGroup] : groups;
  const q = query.trim().toLowerCase();
  const filtered = allGroups
    .map((g) => ({
      ...g,
      items: q ? g.items.filter((i) => i.title.toLowerCase().includes(q)) : g.items,
    }))
    .filter((g) => g.items.length > 0);

  async function handleSignOut() {
    await signOut();
    router.push("/admin/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <Sidebar className="border-zinc-800 bg-black">
      <SidebarHeader className="gap-3 border-b border-zinc-800/60 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href="/admin" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="TravelTomo" className="h-7 w-auto" />
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Merchant Portal
            </p>
          </Link>
          <Link
            href="/admin/rewards"
            title="Create rewards"
            className="relative shrink-0 text-red-400 hover:text-red-300"
          >
            <Gift className="h-5 w-5" />
            <span className="pointer-events-none absolute right-0 top-7 w-28 rounded-lg border border-dashed border-red-500/40 bg-red-500/5 px-2 py-1 text-center text-[9px] leading-tight text-red-300">
              Click me to create rewards!
            </span>
          </Link>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full rounded-full border border-zinc-800 bg-zinc-900/80 py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-red-500/50 focus:outline-none"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {filtered.map((group) => (
          <div key={group.label} className="px-1 py-1.5">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              {group.label}
            </p>
            <nav className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-full px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-red-600 font-medium text-white shadow-sm shadow-red-900/40"
                        : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-zinc-600">No matches.</p>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-zinc-800/60 p-2">
        <p className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          General
        </p>
        <nav className="space-y-1">
          <a
            href="/help"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-full px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-white"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Help &amp; Support</span>
          </a>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/70 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </nav>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-900/60 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-white">
            {(user.display_name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">
              {user.display_name ?? "Merchant"}
            </p>
            <p className="truncate text-[10px] text-zinc-500">{user.email}</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
