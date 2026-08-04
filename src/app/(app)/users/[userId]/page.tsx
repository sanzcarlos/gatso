import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import UserProfileClient from "./user-profile-client";

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function UserProfilePage({ params }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { userId } = await params;

  return <UserProfileClient userId={userId} currentUserId={session.userId} />;
}
