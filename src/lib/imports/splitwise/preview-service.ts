import { getSplitwiseClientForUser } from "./connection-service";
import { fetchAllSplitwiseExpenses } from "./paginate";
import { extractSplitwiseShares } from "./mapping";
import type { SplitwiseExpense, SplitwiseUser } from "./client";

export interface ImportPreviewParticipant {
  externalId: string;
  displayName: string;
}

export interface ImportPreviewCurrencyBreakdown {
  currencyCode: string;
  expenseCount: number;
}

export interface ImportPreview {
  sourceGroupExternalId: string;
  sourceGroupName: string;
  /**
   * Nombres de Splitwise para que el usuario pueda mapear participantes
   * (backlog: "Gatso propone el mapeo de participantes [...] debe
   * revisarse"). Solo se devuelven en esta respuesta transitoria al
   * propio usuario autenticado; nunca se persisten en Gatso ni se
   * auditan (principio de minima informacion, Fase 1).
   */
  participants: ImportPreviewParticipant[];
  dateRange: { earliest: string | null; latest: string | null };
  currencies: ImportPreviewCurrencyBreakdown[];
  expenseCount: number;
  paymentCount: number;
  deletedCount: number;
  multiPayerExpenseCount: number;
  /**
   * Datos que Splitwise tiene pero Gatso no puede representar (backlog:
   * "nunca se descartaran en silencio"). `withComments` cuenta gastos con
   * hilo de comentarios/discusion (`comments_count` > 0): NO se
   * importan (requeririan una llamada HTTP extra por gasto). Distinto de
   * las notas propias del gasto (campo `details` de Splitwise), que SI
   * se importan en `expenses.notes` de Gatso (ver `job-service.ts`).
   */
  unsupportedDataCounts: { withReceipts: number; withComments: number; recurring: number };
  /** `true` si la vista previa se calculo sobre un subconjunto (se alcanzo el limite de paginas de seguridad). */
  truncated: boolean;
}

export function displayNameFor(user: SplitwiseUser | null | undefined): string {
  if (!user) return "Usuario de Splitwise";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || "Usuario de Splitwise";
}

function hasReceipt(expense: SplitwiseExpense): boolean {
  return Boolean(expense.receipt?.original);
}

function hasComments(expense: SplitwiseExpense): boolean {
  return (expense.comments_count ?? 0) > 0;
}

function isRecurring(expense: SplitwiseExpense): boolean {
  return Boolean(expense.repeats);
}

/**
 * Genera una vista previa de la importacion SIN escribir nada en Gatso
 * (backlog Fase 11: "Mostrar una vista previa antes de escribir en
 * Gatso"): solo lectura de la API de Splitwise, agregada en memoria.
 */
export async function buildSplitwisePreview(userId: string, sourceGroupExternalId: string): Promise<ImportPreview> {
  const client = await getSplitwiseClientForUser(userId);

  const [{ group }, { expenses, truncated }] = await Promise.all([
    client.getGroup(sourceGroupExternalId),
    fetchAllSplitwiseExpenses(client, sourceGroupExternalId),
  ]);

  const participantById = new Map<string, ImportPreviewParticipant>();
  for (const member of group.members) {
    participantById.set(String(member.id), { externalId: String(member.id), displayName: displayNameFor(member) });
  }
  // Los gastos historicos pueden mencionar personas que ya abandonaron el
  // grupo. Tambien deben poder mapearse y conservar su nombre de Splitwise.
  for (const expense of expenses) {
    for (const share of expense.users) {
      const externalId = String(share.user_id);
      if (!participantById.has(externalId)) {
        participantById.set(externalId, {
          externalId,
          displayName: share.user ? displayNameFor(share.user) : `Participante ${externalId}`,
        });
      }
    }
  }
  const participants = [...participantById.values()];

  const active = expenses.filter((expense) => !expense.deleted_at);
  const deletedCount = expenses.length - active.length;
  const paymentCount = active.filter((expense) => expense.payment).length;
  const realExpenses = active.filter((expense) => !expense.payment);

  const currencyCounts = new Map<string, number>();
  let earliest: string | null = null;
  let latest: string | null = null;
  let multiPayerExpenseCount = 0;
  let withReceipts = 0;
  let withComments = 0;
  let recurring = 0;

  for (const expense of realExpenses) {
    currencyCounts.set(expense.currency_code, (currencyCounts.get(expense.currency_code) ?? 0) + 1);
    if (!earliest || expense.date < earliest) earliest = expense.date;
    if (!latest || expense.date > latest) latest = expense.date;

    const { payers } = extractSplitwiseShares(expense);
    if (payers.length > 1) multiPayerExpenseCount++;

    if (hasReceipt(expense)) withReceipts++;
    if (hasComments(expense)) withComments++;
    if (isRecurring(expense)) recurring++;
  }

  return {
    sourceGroupExternalId,
    sourceGroupName: group.name,
    participants,
    dateRange: { earliest, latest },
    currencies: [...currencyCounts.entries()].map(([currencyCode, expenseCount]) => ({ currencyCode, expenseCount })),
    expenseCount: realExpenses.length,
    paymentCount,
    deletedCount,
    multiPayerExpenseCount,
    unsupportedDataCounts: { withReceipts, withComments, recurring },
    truncated,
  };
}

/** Lista los grupos de Splitwise visibles para el usuario conectado (backlog: "Seleccionar uno o varios grupos accesibles"). */
export async function listSplitwiseGroups(userId: string) {
  const client = await getSplitwiseClientForUser(userId);
  const { groups } = await client.getGroups();
  return groups.map((group) => ({
    externalId: String(group.id),
    name: group.name,
    memberCount: group.members.length,
  }));
}
