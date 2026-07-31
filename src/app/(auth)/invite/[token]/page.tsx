import InviteAcceptClient from "./invite-accept-client";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteAcceptPage({ params }: PageProps) {
  const { token } = await params;
  return <InviteAcceptClient token={token} />;
}
