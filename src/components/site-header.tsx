"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, LogIn, LogOut, Menu, ShieldCheck, UserPlus, Users, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationsBell } from "@/components/notifications-bell";
import { apiFetch } from "@/lib/api/client-fetch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SiteHeaderProps {
  session: { userId: string; alias: string; isPlatformAdmin?: boolean } | null;
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
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2.5 font-bold tracking-tight text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG decorativo pequeno, no requiere next/image */}
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/15 transition-transform group-hover:scale-105">
            <img src="/icons/icon.svg" alt="" width={24} height={24} className="rounded-lg" aria-hidden="true" />
          </span>
          <span className="text-lg">Gatso</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-1 pl-4 text-sm md:flex">
          {session ? (
            <Link href="/groups" className="rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Mis grupos
            </Link>
          ) : null}
          {session?.isPlatformAdmin ? (
            <Link
              href="/admin/currencies"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="h-4 w-4" />
              Administracion
            </Link>
          ) : null}
          <Link href="/version" className="rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Version
          </Link>
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {session ? (
            <>
              <NotificationsBell />
              <span className="hidden text-sm text-muted-foreground lg:inline">
                <Link href={`/users/${session.userId}`} className="rounded-lg px-2 py-1 font-medium hover:bg-muted hover:text-foreground">
                  {session.alias}
                </Link>
              </span>
              <Button className="hidden md:inline-flex" variant="ghost" size="icon" aria-label="Cerrar sesion" onClick={handleLogout}>
                <LogOut />
              </Button>
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" asChild>
                <Link href="/login">Iniciar sesion</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Crear cuenta</Link>
              </Button>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <Menu />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {session ? <DropdownMenuLabel>Hola, {session.alias}</DropdownMenuLabel> : <DropdownMenuLabel>Navegacion</DropdownMenuLabel>}
              <DropdownMenuSeparator />
              {session ? (
                <>
                  <DropdownMenuItem asChild><Link href="/groups" className="gap-2"><Users /> Mis grupos</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href={`/users/${session.userId}`} className="gap-2"><UserRound /> Mi perfil</Link></DropdownMenuItem>
                  {session.isPlatformAdmin ? (
                    <DropdownMenuItem asChild><Link href="/admin/currencies" className="gap-2"><ShieldCheck /> Administracion</Link></DropdownMenuItem>
                  ) : null}
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild><Link href="/login" className="gap-2"><LogIn /> Iniciar sesion</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link href="/register" className="gap-2"><UserPlus /> Crear cuenta</Link></DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem asChild><Link href="/version" className="gap-2"><Info /> Version</Link></DropdownMenuItem>
              {session ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={handleLogout}><LogOut /> Cerrar sesion</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
