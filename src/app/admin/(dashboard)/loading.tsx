import { PageSkeleton } from "@/components/dashboard/page-skeleton";

/**
 * Shown by Next.js while any server-component page in this route segment
 * is fetching its data (analytics, rewards, dashboard home, etc.)
 */
export default function DashboardLoading() {
  return <PageSkeleton variant="list" />;
}
