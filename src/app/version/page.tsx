import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { SiteHeader } from "@/components/site-header";
import { getVersionInfo } from "@/lib/version";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const ENVIRONMENT_LABEL: Record<string, string> = {
  production: "Produccion",
  preview: "Preview",
  development: "Desarrollo",
  test: "Test",
};

const ENVIRONMENT_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  production: "success",
  preview: "warning",
  development: "secondary",
  test: "secondary",
};

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

/**
 * Pagina publica de diagnostico (sin autenticacion, igual que
 * `/api/health`): permite saber que version del codigo esta desplegada en
 * cada entorno (produccion, preview, desarrollo) sin acceder a la consola
 * de Vercel. Ver `src/lib/version.ts` para el origen de cada dato.
 */
export default async function VersionPage() {
  const session = await getSession();
  const isAdmin = session ? await isPlatformAdmin(session.userId) : false;
  const info = getVersionInfo();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader session={session ? { ...session, isPlatformAdmin: isAdmin } : null} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Version desplegada</h1>
            <p className="text-sm text-muted-foreground">
              Informacion de diagnostico sobre el despliegue que estas usando ahora mismo.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Aplicacion</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Row label="Version" value={<Badge variant="outline">{info.appVersion}</Badge>} />
              <Row
                label="Entorno"
                value={
                  <Badge variant={ENVIRONMENT_VARIANT[info.environment] ?? "secondary"}>
                    {ENVIRONMENT_LABEL[info.environment] ?? info.environment}
                  </Badge>
                }
              />
              {info.region ? <Row label="Region" value={info.region} /> : null}
              {info.deploymentId ? (
                <Row
                  label="Deployment ID"
                  value={
                    <Badge variant="outline" className="font-mono text-xs">
                      {info.deploymentId}
                    </Badge>
                  }
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commit de Git</CardTitle>
              <CardDescription>
                {info.commit
                  ? "Commit exacto que se desplego para generar esta instancia."
                  : 'No disponible: en desarrollo local, o falta activar "Enable access to System Environment Variables" en la configuracion del proyecto en Vercel.'}
              </CardDescription>
            </CardHeader>
            {info.commit ? (
              <CardContent className="flex flex-col gap-3 text-sm">
                <Row
                  label="SHA"
                  value={
                    <Badge variant="outline" className="font-mono text-xs">
                      {info.commit.shortSha}
                    </Badge>
                  }
                />
                {info.commit.ref ? <Row label="Rama" value={info.commit.ref} /> : null}
                {info.commit.message ? <Row label="Mensaje" value={info.commit.message} /> : null}
              </CardContent>
            ) : null}
          </Card>
        </div>
      </main>
    </div>
  );
}
