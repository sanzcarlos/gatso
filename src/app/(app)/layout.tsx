import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { SiteHeader } from "@/components/site-header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const isAdmin = session ? await isPlatformAdmin(session.userId) : false;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader session={session ? { ...session, isPlatformAdmin: isAdmin } : null} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
