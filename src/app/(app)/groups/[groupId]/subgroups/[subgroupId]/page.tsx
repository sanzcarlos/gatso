import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import SubgroupDetailClient from "./subgroup-detail-client";

interface PageProps {
  params: Promise<{ groupId: string; subgroupId: string }>;
}

export default async function SubgroupDetailPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { groupId, subgroupId } = await params;

  return <SubgroupDetailClient groupId={groupId} subgroupId={subgroupId} currentUserId={session.userId} />;
}
