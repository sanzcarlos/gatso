import { apiFetch } from "@/lib/api/client-fetch";

/**
 * `GET /api/groups/:groupId/expenses` esta paginado por cursor (ver
 * `src/lib/pagination.ts` y `listExpenses`) para no devolver una respuesta
 * sin limite cuando un grupo acumula muchos gastos. La UI actual (busqueda
 * y filtros en `GroupSummaryCard`) sigue esperando la lista completa, asi
 * que este helper recorre todas las paginas de forma transparente (con un
 * limite de paginas de seguridad para no encadenar peticiones sin fin si
 * el backend devolviera un cursor invalido).
 */
export async function fetchAllExpenses(groupId: string, subgroupId?: string): Promise<unknown[] | null> {
  const items: unknown[] = [];
  let cursor: string | null = null;
  const MAX_PAGES = 50;

  for (let page = 0; page < MAX_PAGES; page++) {
    const searchParams = new URLSearchParams();
    if (subgroupId) searchParams.set("subgroupId", subgroupId);
    searchParams.set("limit", "100");
    if (cursor) searchParams.set("cursor", cursor);

    const response = await apiFetch(`/api/groups/${groupId}/expenses?${searchParams.toString()}`);
    if (!response.ok) return page === 0 ? null : items;

    const data = await response.json();
    items.push(...(data.expenses ?? []));
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }

  return items;
}
