/**
 * Envuelve una funcion async para que, si ya hay una ejecucion en curso,
 * las llamadas concurrentes reutilicen esa misma promesa en vez de
 * disparar una segunda ejecucion en paralelo (p. ej. varias peticiones
 * HTTP simultaneas en la misma instancia calida de una funcion serverless
 * intentando refrescar los tipos de cambio del BCE a la vez, Fase 10).
 *
 * No sustituye un lock distribuido entre instancias: es una proteccion de
 * "mismo proceso", suficiente para evitar rafagas de peticiones
 * redundantes dentro de la misma instancia; entre instancias distintas la
 * ventana de carrera la sigue acotando `shouldAttemptEcbRefresh` (TTL) y,
 * en ultima instancia, la clave `(currency_code, as_of_date)` unica de
 * `exchange_rates` (upsert idempotente en `storeEcbRates`).
 */
export function createSingleFlight<T>(factory: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return function run(): Promise<T> {
    if (inFlight) return inFlight;
    inFlight = factory().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
