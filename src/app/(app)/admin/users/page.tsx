import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import AdminUsersClient from "./admin-users-client";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = await isPlatformAdmin(session.userId);
  if (!isAdmin) redirect("/groups");

  return <AdminUsersClient currentUserId={session.userId} />;
}
