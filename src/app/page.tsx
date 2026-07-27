import { getSession } from "@/lib/auth/session";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader session={session} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Gatso</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          Control de gastos compartidos entre amigos, con privacidad por diseno.
        </p>

        {session ? (
          <p className="text-foreground">
            Sesion activa como <strong>{session.alias}</strong>.
          </p>
        ) : (
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/register">Crear cuenta</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">Iniciar sesion</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
