export default function Loading() {
  return (
    <main
      className="relative isolate grid min-h-dvh place-items-center overflow-hidden bg-accent px-6 py-10 text-accent-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="gatso-loading-orb absolute -left-24 top-[8%] h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="gatso-loading-orb gatso-loading-orb-delayed absolute -right-24 bottom-[10%] h-72 w-72 rounded-full bg-info/10 blur-3xl" />
      </div>

      <section className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative mb-7" aria-hidden="true">
          <div className="gatso-loading-halo absolute -inset-5 rounded-[2rem] border border-primary/15 bg-primary/5" />
          <div className="relative grid h-20 w-20 place-items-center rounded-[1.4rem] bg-primary shadow-lg shadow-primary/25">
            <svg
              viewBox="0 0 24 24"
              className="h-11 w-11 fill-none stroke-primary-foreground"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 4v1.882c0 .685.387 1.312 1 1.618s1 .933 1 1.618V18a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9.118c0-.685.387-1.312 1-1.618s1-.933 1-1.618V4" />
              <path d="M6 4h12" />
              <path d="M12 13H9" />
              <path d="M14 10.172a3 3 0 1 0 0 5.656" />
            </svg>
          </div>
        </div>

        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-accent-foreground">Gatso</p>
        <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-accent-foreground">
          Preparando tus cuentas
        </h1>
        <p className="mt-2 max-w-xs text-sm leading-6 text-accent-foreground">
          Estamos poniendo tus grupos y gastos al día.
        </p>

        <div className="mt-8 flex items-center gap-2" role="status">
          <span className="sr-only">Cargando la aplicación</span>
          <span className="gatso-loading-dot h-2 w-2 rounded-full bg-accent-foreground" />
          <span className="gatso-loading-dot gatso-loading-dot-second h-2 w-2 rounded-full bg-accent-foreground" />
          <span className="gatso-loading-dot gatso-loading-dot-third h-2 w-2 rounded-full bg-accent-foreground" />
        </div>
      </section>
    </main>
  );
}
