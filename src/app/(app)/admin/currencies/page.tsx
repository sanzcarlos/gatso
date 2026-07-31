import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import AdminCurrenciesClient from "./admin-currencies-client";

export default async function AdminCurrenciesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = await isPlatformAdmin(session.userId);
  if (!isAdmin) redirect("/groups");

  return <AdminCurrenciesClient />;
}
