"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  listUsers,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
  type ManagedUser,
  type UserRole,
} from "@/lib/actions/users";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  UserCog,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const ROLE_COLORS: Record<UserRole, string> = {
  user: "border-zinc-700 text-zinc-400",
  merchant: "border-blue-600 text-blue-400",
  admin: "border-purple-600 text-purple-400",
  superadmin: "border-red-600 text-red-400",
};

const ROLES: UserRole[] = ["user", "merchant", "admin", "superadmin"];

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Dialog state
  const [banDialog, setBanDialog] = useState<ManagedUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [roleDialog, setRoleDialog] = useState<ManagedUser | null>(null);
  const [newRole, setNewRole] = useState<UserRole>("user");
  const [deleteDialog, setDeleteDialog] = useState<ManagedUser | null>(null);

  const [isPending, startTransition] = useTransition();
  const PAGE_SIZE = 20;

  const load = useCallback(
    async (p: number, s: string, r: string) => {
      setIsLoading(true);
      try {
        const result = await listUsers({ search: s, role: r, page: p, pageSize: PAGE_SIZE });
        setUsers(result.users);
        setTotal(result.total);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load users");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load(1, search, roleFilter);
    }, 350);
    return () => clearTimeout(t);
  }, [search, roleFilter, load]);

  useEffect(() => {
    load(page, search, roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleRoleOpen(u: ManagedUser) {
    setNewRole(u.role);
    setRoleDialog(u);
  }

  function confirmBan() {
    if (!banDialog) return;
    const target = banDialog;
    startTransition(async () => {
      const r = await banUser(target.id, banReason);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(`${target.display_name ?? target.email} banned`);
        setBanDialog(null);
        setBanReason("");
        load(page, search, roleFilter);
      }
    });
  }

  function confirmUnban(u: ManagedUser) {
    startTransition(async () => {
      const r = await unbanUser(u.id);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(`${u.display_name ?? u.email} unbanned`);
        load(page, search, roleFilter);
      }
    });
  }

  function confirmRoleUpdate() {
    if (!roleDialog) return;
    const target = roleDialog;
    startTransition(async () => {
      const r = await updateUserRole(target.id, newRole);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(`Role updated to ${newRole}`);
        setRoleDialog(null);
        load(page, search, roleFilter);
      }
    });
  }

  function confirmDelete() {
    if (!deleteDialog) return;
    const target = deleteDialog;
    startTransition(async () => {
      const r = await deleteUser(target.id);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(`${target.display_name ?? target.email} deleted`);
        setDeleteDialog(null);
        load(page, search, roleFilter);
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-zinc-400 mt-1">
          View, ban, unban, change roles, or delete users.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="pl-9 bg-zinc-800 border-zinc-700 text-white"
          />
        </div>
        <Select
          value={roleFilter || "all"}
          onValueChange={(v) => setRoleFilter(v === "all" ? "" : (v ?? ""))}
        >
          <SelectTrigger className="w-40 bg-zinc-800 border-zinc-700 text-white">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-zinc-400 text-sm self-center">
          {total} user{total !== 1 ? "s" : ""}
        </span>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Users</CardTitle>
          <CardDescription className="text-zinc-400">
            Page {page} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">No users found.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  {/* Avatar */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-white">
                    {(u.display_name ?? u.email)?.[0]?.toUpperCase() ?? "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {u.display_name ?? <span className="text-zinc-400">(no name)</span>}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{u.email ?? u.id}</p>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`capitalize ${ROLE_COLORS[u.role]}`}
                    >
                      {u.role}
                    </Badge>
                    {u.banned_at && (
                      <Badge variant="outline" className="border-red-700 text-red-400">
                        Banned
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Change role */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-zinc-400 hover:text-white"
                      title="Change role"
                      onClick={() => handleRoleOpen(u)}
                    >
                      <UserCog className="h-4 w-4" />
                    </Button>

                    {/* Ban / Unban */}
                    {u.banned_at ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-400 hover:text-green-300"
                        title="Unban user"
                        onClick={() => confirmUnban(u)}
                        disabled={isPending}
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-yellow-400 hover:text-yellow-300"
                        title="Ban user"
                        onClick={() => { setBanDialog(u); setBanReason("" as string); }}
                      >
                        <ShieldBan className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Delete */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      title="Delete user"
                      onClick={() => setDeleteDialog(u)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="border-zinc-700 text-zinc-300"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-zinc-400">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="border-zinc-700 text-zinc-300"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Ban Dialog */}
      <Dialog open={!!banDialog} onOpenChange={(o) => !o && setBanDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Ban user</DialogTitle>
            <DialogDescription className="text-zinc-400">
              <strong className="text-white">
                {banDialog?.display_name ?? banDialog?.email}
              </strong>{" "}
              will lose access immediately and all their sessions will be invalidated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Label className="text-zinc-300">Reason (optional)</Label>
            <Input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="e.g. spam, abuse, policy violation"
              className="bg-zinc-800 border-zinc-700 text-white"
            />
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={() => setBanDialog(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              onClick={confirmBan}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ban user"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Dialog */}
      <Dialog open={!!roleDialog} onOpenChange={(o) => !o && setRoleDialog(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update role for{" "}
              <strong className="text-white">
                {roleDialog?.display_name ?? roleDialog?.email}
              </strong>
              . Changes take effect on next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Label className="text-zinc-300">New role</Label>
            <Select
              value={newRole}
              onValueChange={(v) => setNewRole(v as UserRole)}
            >
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={() => setRoleDialog(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmRoleUpdate}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update role"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteDialog}
        onOpenChange={(o) => !o && setDeleteDialog(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400">Delete user permanently</DialogTitle>
            <DialogDescription className="text-zinc-400">
              This will permanently delete{" "}
              <strong className="text-white">
                {deleteDialog?.display_name ?? deleteDialog?.email}
              </strong>{" "}
              and all their data. This cannot be undone. Only superadmins can do this.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={() => setDeleteDialog(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800 text-white"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete permanently"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
