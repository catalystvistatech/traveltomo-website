import { redirect } from "next/navigation";

// traveltomo.app/superadmin: a short address for the superadmin overview.
// The /admin login gate applies on the way through.
export default function SuperadminPage() {
  redirect("/admin/manage/overview");
}
