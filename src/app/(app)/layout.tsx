import { getSession } from "@/lib/auth/session";
import { getSessionDisplayInfo } from "@/lib/users/service";
import { SiteHeader } from "@/components/site-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const { displayName, isPlatformAdmin: isAdmin } = session
    ? await getSessionDisplayInfo(session.userId)
    : { displayName: null, isPlatformAdmin: false };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        session={
          session
            ? { userId: session.userId, username: session.username, displayName: displayName ?? session.username, isPlatformAdmin: isAdmin }
            : null
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</main>
    </div>
  );
}
