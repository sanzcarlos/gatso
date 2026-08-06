import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive, Coins, ScrollText, ShieldCheck, Users } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ADMIN_SECTIONS = [
  {
    href: "/admin/users",
    icon: Users,
    title: "Administradores de plataforma",
    description: "Consultar usuarios y conceder o revocar el rol de administrador de plataforma.",
  },
  {
    href: "/admin/currencies",
    icon: Coins,
    title: "Monedas",
    description: "Gestionar el catalogo global de monedas activas para crear gastos.",
  },
  {
    href: "/admin/groups",
    icon: Archive,
    title: "Grupos archivados",
    description: "Restaurar grupos sin miembros antes de que se borren de forma definitiva.",
  },
  {
    href: "/admin/audit-log",
    icon: ScrollText,
    title: "Auditoria de plataforma",
    description: "Historial inmutable de acciones sobre catalogos y roles globales.",
  },
] as const;

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = await isPlatformAdmin(session.userId);
  if (!isAdmin) redirect("/groups");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Administracion de plataforma</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="block">
            <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
              <CardHeader>
                <section.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
