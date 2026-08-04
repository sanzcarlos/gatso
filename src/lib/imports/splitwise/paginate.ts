import type { SplitwiseClient, SplitwiseExpense } from "./client";

/**
 * Paginacion de `get_expenses` (Fase 11). `PAGE_SIZE` mayor que el
 * default de la API (20, ver documentacion oficial) para reducir el
 * numero de peticiones; `limit` es un parametro de consulta normal, no
 * hay un maximo documentado. `MAX_PAGES` es un limite de seguridad local
 * (mismo criterio que `fetch-all.ts` para la paginacion propia de
 * Gatso): evita encadenar peticiones sin fin si Splitwise devolviera
 * paginas completas indefinidamente.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

export interface FetchExpensesPageResult {
  expenses: SplitwiseExpense[];
  nextOffset: number;
  hasMore: boolean;
}

export async function fetchSplitwiseExpensesPage(
  client: SplitwiseClient,
  groupId: string,
  offset: number,
  updatedAfter?: string,
): Promise<FetchExpensesPageResult> {
  const response = await client.getExpenses({ groupId, limit: PAGE_SIZE, offset, updatedAfter });
  const expenses = response.expenses ?? [];
  return { expenses, nextOffset: offset + expenses.length, hasMore: expenses.length === PAGE_SIZE };
}

export interface FetchAllExpensesResult {
  expenses: SplitwiseExpense[];
  /** `true` si se alcanzo `MAX_PAGES` sin agotar las paginas disponibles (el resultado esta incompleto). */
  truncated: boolean;
}

/**
 * Recorre todas las paginas de `get_expenses` para un grupo. Reutilizado
 * tanto por la vista previa (`preview-service.ts`, solo lectura) como por
 * el job de importacion real (que ademas persiste `offset` en
 * `import_jobs.cursor` entre llamadas para poder reanudarse tras un
 * fallo sin volver a pedir paginas ya procesadas, ver `job-service.ts`).
 */
export async function fetchAllSplitwiseExpenses(
  client: SplitwiseClient,
  groupId: string,
  updatedAfter?: string,
): Promise<FetchAllExpensesResult> {
  const all: SplitwiseExpense[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { expenses, nextOffset, hasMore } = await fetchSplitwiseExpensesPage(client, groupId, offset, updatedAfter);
    all.push(...expenses);
    offset = nextOffset;
    if (!hasMore) return { expenses: all, truncated: false };
  }
  return { expenses: all, truncated: true };
}
