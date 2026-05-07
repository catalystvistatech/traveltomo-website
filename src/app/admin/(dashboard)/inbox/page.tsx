"use client";

import { useEffect, useState, useTransition } from "react";
import { getNotifications, markNotificationsRead, type Notification } from "@/lib/actions/notifications";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, CheckCheck, Inbox } from "lucide-react";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<Notification["kind"], string> = {
  challenge_unlocked: "Challenge",
  challenge_verified: "Verified",
  reward_ready: "Reward",
  merchant_status: "Status",
  system: "System",
};

const KIND_COLORS: Record<Notification["kind"], string> = {
  challenge_unlocked: "bg-blue-600/20 text-blue-400",
  challenge_verified: "bg-green-600/20 text-green-400",
  reward_ready: "bg-yellow-600/20 text-yellow-400",
  merchant_status: "bg-purple-600/20 text-purple-400",
  system: "bg-zinc-700 text-zinc-300",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function InboxPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  async function reload() {
    setIsLoading(true);
    const { data, unread_count } = await getNotifications();
    setItems(data);
    setUnreadCount(unread_count);
    setIsLoading(false);
  }

  useEffect(() => { reload(); }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  function handleMarkAll() {
    startTransition(async () => {
      const result = await markNotificationsRead();
      if (result.error) { toast.error(result.error); return; }
      toast.success("All notifications marked as read.");
      await reload();
    });
  }

  function handleMarkOne(id: string) {
    startTransition(async () => {
      const result = await markNotificationsRead([id]);
      if (result.error) { toast.error(result.error); return; }
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            Inbox
            {unreadCount > 0 && (
              <Badge className="bg-red-600 text-white text-xs">{unreadCount}</Badge>
            )}
          </h1>
          <p className="text-zinc-400 mt-1">
            Notifications about your business, challenges, and account.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={pending}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Inbox className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">All caught up</h3>
            <p className="text-zinc-400 mt-1 text-sm">No notifications yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const isUnread = !n.read_at;
            return (
              <Card
                key={n.id}
                className={cn(
                  "border transition-colors",
                  isUnread
                    ? "bg-zinc-900 border-zinc-700"
                    : "bg-zinc-900/50 border-zinc-800"
                )}
              >
                <CardContent className="flex items-start gap-4 py-4">
                  <div className="mt-0.5 flex-shrink-0">
                    {isUnread ? (
                      <Bell className="h-4 w-4 text-red-400" />
                    ) : (
                      <BellOff className="h-4 w-4 text-zinc-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={cn("text-xs", KIND_COLORS[n.kind])}>
                        {KIND_LABELS[n.kind]}
                      </Badge>
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
                      )}
                    </div>
                    <p className={cn("mt-1 text-sm font-medium", isUnread ? "text-white" : "text-zinc-400")}>
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{n.body}</p>
                    )}
                    <p className="mt-1 text-xs text-zinc-600">{timeAgo(n.created_at)}</p>
                  </div>
                  {isUnread && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkOne(n.id)}
                      disabled={pending}
                      className="text-zinc-500 hover:text-zinc-300 shrink-0 text-xs"
                    >
                      Mark read
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
