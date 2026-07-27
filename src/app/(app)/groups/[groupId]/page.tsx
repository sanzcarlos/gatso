import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import GroupDetailClient from "./group-detail-client";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { groupId } = await params;

  return <GroupDetailClient groupId={groupId} currentUserId={session.userId} />;
}
