import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { SiteHeader } from "@/components/site-header";
import { InstallPrompt } from "@/components/install-prompt";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Calculator, ReceiptText, ShieldCheck, Wifi, type LucideIcon } from "lucide-react";

const homeFeatures: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Calculator, title: "Repartos exactos", description: "Iguales, por porcentaje o por importe, siempre sin perder un centimo." },
  { icon: Wifi, title: "Funciona offline", description: "Consulta tus ultimos datos y anade gastos aunque pierdas la conexion." },
  { icon: ShieldCheck, title: "Privacidad real", description: "Un alias es suficiente. No recopilamos datos de contacto." },
];

export default async function HomePage() {
  const session = await getSession();
  const isAdmin = session ? await isPlatformAdmin(session.userId) : false;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader session={session ? { ...session, isPlatformAdmin: isAdmin } : null} />
      <InstallPrompt />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <section className="grid items-center gap-12 lg:grid-cols-[1.08fr_.92fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
              <ShieldCheck className="h-4 w-4" /> Privacidad por diseno
            </div>
            <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-6xl sm:leading-[1.05]">
              Las cuentas claras, sin complicarlo todo.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Crea grupos, reparte gastos con precision y descubre la forma mas sencilla de saldar deudas. Sin emails ni telefonos.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href={session ? "/groups" : "/register"}>
                  {session ? "Ir a mis grupos" : "Empezar gratis"}<ArrowRight />
                </Link>
              </Button>
              {!session ? <Button size="lg" variant="outline" asChild><Link href="/login">Ya tengo cuenta</Link></Button> : null}
            </div>
            {session ? <p className="mt-4 text-sm text-muted-foreground">Sesion activa como <strong className="text-foreground">{session.alias}</strong></p> : null}
          </div>

          <div className="relative mx-auto w-full max-w-lg">
            <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/10 blur-3xl" />
            <div className="rounded-[2rem] border border-border/80 bg-card/80 p-5 shadow-lg backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between border-b border-border pb-5">
                <div><p className="text-sm text-muted-foreground">Viaje de verano</p><p className="mt-1 text-xl font-bold">Resumen del grupo</p></div>
                <span className="rounded-xl bg-success/10 px-3 py-1 text-sm font-semibold text-success">Al dia</span>
              </div>
              <div className="grid grid-cols-2 gap-3 py-5">
                <div className="rounded-2xl bg-muted/70 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p><p className="mt-2 text-2xl font-bold">1.284,60 EUR</p></div>
                <div className="rounded-2xl bg-primary/10 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Movimientos</p><p className="mt-2 text-2xl font-bold">24</p></div>
              </div>
              <div className="space-y-3">
                {[['Casa rural', '420,00 EUR'], ['Compra del finde', '126,40 EUR'], ['Gasolina', '84,20 EUR']].map(([label, value], index) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><ReceiptText className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{label}</p><p className="text-xs text-muted-foreground">{index + 2} participantes</p></div>
                    <p className="font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {homeFeatures.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl border border-border/80 bg-card/65 p-6 shadow-sm backdrop-blur-sm">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
              <h2 className="mt-5 text-lg font-bold tracking-tight">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
