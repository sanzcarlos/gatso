import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import AdminGroupsClient from "./admin-groups-client";

export default async function AdminGroupsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = await isPlatformAdmin(session.userId);
  if (!isAdmin) redirect("/groups");

  return <AdminGroupsClient />;
}
