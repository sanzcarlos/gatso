import { SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader session={null} />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_28rem] lg:px-8 lg:py-16">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              Privacidad desde el primer dia
            </div>
            <h1 className="text-balance text-5xl font-bold tracking-tight text-foreground">
              Compartir gastos puede ser sencillo.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
              Organiza grupos, reparte cada gasto y liquida deudas sin emails, telefonos ni datos personales.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-3">
              {[
                ["Usuario privado", "Tu identidad se limita a lo necesario."],
                ["Calculo exacto", "Importes siempre tratados en centimos."],
                ["Disponible offline", "Consulta y anota gastos sin cobertura."],
                ["Auditoria clara", "Los cambios importantes dejan historial."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-2xl border border-border/80 bg-card/65 p-4 shadow-sm backdrop-blur">
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
