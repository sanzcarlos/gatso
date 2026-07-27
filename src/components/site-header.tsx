"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch } from "@/lib/api/client-fetch";

interface SiteHeaderProps {
  session: { userId: string; alias: string } | null;
}

export function SiteHeader({ session }: SiteHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    const response = await apiFetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      toast.error("No se pudo cerrar sesion");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Wallet className="h-5 w-5 text-primary" aria-hidden="true" />
          Gatso
        </Link>

        <nav className="flex flex-1 items-center gap-4 text-sm">
          {session ? (
            <Link href="/groups" className="text-muted-foreground transition-colors hover:text-foreground">
              Mis grupos
            </Link>
          ) : null}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">{session.alias}</span>
              <Button variant="ghost" size="icon" aria-label="Cerrar sesion" onClick={handleLogout}>
                <LogOut />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link href="/login">Iniciar sesion</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
