import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import GroupsClient from "./groups-client";

export default async function GroupsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <GroupsClient />;
}
