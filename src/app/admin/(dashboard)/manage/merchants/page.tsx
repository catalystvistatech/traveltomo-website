"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCurrentUser,
  getRoleManagementData,
  reviewMerchantRequest,
  updateUserRole,
  type UserRole,
} from "@/lib/actions/auth";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/dashboard/page-skeleton";

type ManagedProfile = {
  id: string;
  role: UserRole;
  merchant_request_status: string | null;
  display_name: string | null;
  created_at: string;
  businesses?: Record<string, unknown>[];
};

const roleOptions: UserRole[] = ["user", "merchant", "admin", "superadmin"];

export default function ManageMerchantsPage() {
  const [profilesList, setProfilesList] = useState<ManagedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerRole, setViewerRole] = useState<UserRole>("user");
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    const [viewer, managed] = await Promise.all([
      getCurrentUser(),
      getRoleManagementData(),
    ]);

    if (viewer) setViewerRole(viewer.role);

    if (managed.error) {
      toast.error(managed.error);
    } else {
      setProfilesList((managed.data as ManagedProfile[]) ?? []);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) return <PageSkeleton variant="list" />;

  async function handleRoleChange(userId: string, role: UserRole) {
    setLoadingUserId(userId);
    const result = await updateUserRole(userId, role);
    setLoadingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Role updated to ${role}.`);
    await loadData();
  }

  async function handleReview(
    userId: string,
    decision: "approved" | "rejected" | "suspended"
  ) {
    setLoadingUserId(userId);
    const result = await reviewMerchantRequest(userId, decision);
    setLoadingUserId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Merchant request ${decision}.`);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Merchants & Admins</h1>
        <p className="text-zinc-400 mt-1">
          Superadmins can change all roles. Admins and superadmins can manually verify merchants.
        </p>
      </div>

      {profilesList.length === 0 ? (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-medium text-white">
              No merchants yet
            </h3>
            <p className="text-zinc-400 mt-1">
              Merchants will appear here after they register.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profilesList.map((profile) => {
            const businesses = (profile.businesses ?? []) as Record<string, unknown>[];
            const biz = businesses[0] ?? null;
            const requestStatus = profile.merchant_request_status ?? "none";

            return (
              <Card
                key={profile.id as string}
                className="bg-zinc-900 border-zinc-800"
              >
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-1 min-w-0 flex-1">
                    <CardTitle className="text-white truncate">
                      {(profile.display_name as string) ?? "No name"}
                    </CardTitle>
                    {biz && (
                      <p className="text-xs text-zinc-500">
                        {biz.name as string}
                      </p>
                    )}
                  </div>
                  <Badge className="bg-blue-600/20 text-blue-400">
                    {profile.role}
                  </Badge>
                </CardHeader>
                <CardContent>
                  {biz ? (
                    <div className="space-y-2 text-sm">
                      {(biz.category as string | null) && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Category:</span>
                          <span className="text-zinc-300">
                            {biz.category as string}
                          </span>
                        </div>
                      )}
                      {(biz.city as string | null) && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">City:</span>
                          <span className="text-zinc-300">
                            {biz.city as string}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Business:</span>
                        <Badge
                          className={
                            biz.verification_status === "approved"
                              ? "bg-green-600/20 text-green-400"
                              : biz.verification_status === "pending"
                                ? "bg-yellow-600/20 text-yellow-400"
                                : "bg-zinc-700 text-zinc-300"
                          }
                        >
                          {(biz.verification_status as string) ?? "unsubmitted"}
                        </Badge>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">
                      No business profile yet
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-zinc-500 text-xs">Merchant request:</span>
                    <Badge
                      className={
                        requestStatus === "approved"
                          ? "bg-green-600/20 text-green-400"
                          : requestStatus === "pending"
                            ? "bg-yellow-600/20 text-yellow-400"
                            : requestStatus === "rejected" || requestStatus === "suspended"
                              ? "bg-red-600/20 text-red-400"
                              : "bg-zinc-700 text-zinc-300"
                      }
                    >
                      {requestStatus}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-600 mt-3">
                    Joined{" "}
                    {new Date(
                      profile.created_at as string
                    ).toLocaleDateString()}
                  </p>
                  {(viewerRole === "admin" || viewerRole === "superadmin") && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={loadingUserId === profile.id || requestStatus === "approved"}
                        onClick={() => handleReview(profile.id, "approved")}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Approve Merchant
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingUserId === profile.id || requestStatus === "rejected"}
                        onClick={() => handleReview(profile.id, "rejected")}
                        className="border-red-600 text-red-400 hover:bg-red-600/10"
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loadingUserId === profile.id || requestStatus === "suspended"}
                        onClick={() => handleReview(profile.id, "suspended")}
                        className="border-orange-600 text-orange-400 hover:bg-orange-600/10"
                      >
                        Suspend
                      </Button>
                    </div>
                  )}
                  {viewerRole === "superadmin" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {roleOptions.map((role) => (
                        <Button
                          key={role}
                          size="sm"
                          variant="outline"
                          disabled={loadingUserId === profile.id || profile.role === role}
                          onClick={() => handleRoleChange(profile.id, role)}
                          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                          Set {role}
                        </Button>
                      ))}
                    </div>
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
