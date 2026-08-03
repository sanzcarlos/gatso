import { ReceiptText, UsersRound, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CurrencyExpenseStats } from "@/components/expense-stats-charts";
import type { CurrencySettlement } from "@/components/settlement-card";

export interface SummaryExpense {
  id: string;
  amount: string;
  currencyCode: string;
  description: string;
  expenseDate: string;
  payerAlias: string;
  pending?: boolean;
}

function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatAmount(amount: string, currencyCode: string): string {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `${amount} ${currencyCode}`;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(numericAmount);
}

function getTotalLabel(
  stats: CurrencyExpenseStats[] | null,
  baseCurrencyCode: string,
  totalConvertedCents: number | null | undefined,
): { value: string; detail: string } {
  if (stats === null) return { value: "Cargando...", detail: "Calculando el total" };
  if (stats.length === 0) return { value: formatCents(0, baseCurrencyCode), detail: "Sin gastos registrados" };
  if (stats.length === 1) {
    const onlyCurrency = stats[0]!;
    return {
      value: formatCents(onlyCurrency.totalCents, onlyCurrency.currencyCode),
      detail: "Total registrado",
    };
  }
  if (totalConvertedCents !== null && totalConvertedCents !== undefined) {
    return {
      value: formatCents(totalConvertedCents, baseCurrencyCode),
      detail: `Total convertido a ${baseCurrencyCode}`,
    };
  }
  return {
    value: `${stats.length} monedas`,
    detail: stats.map((item) => formatCents(item.totalCents, item.currencyCode)).join(" · "),
  };
}

export function GroupSummaryCard({
  name,
  scopeLabel,
  expenses,
  stats,
  baseCurrencyCode,
  totalConvertedCents,
  memberCount,
  settlements,
  pendingCount = 0,
}: {
  name: string;
  scopeLabel: "grupo" | "subgrupo";
  expenses: SummaryExpense[];
  stats: CurrencyExpenseStats[] | null;
  baseCurrencyCode: string;
  totalConvertedCents?: number | null;
  memberCount: number;
  settlements: CurrencySettlement[] | null;
  pendingCount?: number;
}) {
  const total = getTotalLabel(stats, baseCurrencyCode, totalConvertedCents);
  const pendingPayments = settlements?.reduce((sum, settlement) => sum + settlement.transactions.length, 0);
  const recentExpenses = expenses.slice(0, 3);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card/85 p-5 shadow-lg backdrop-blur-xl sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{name}</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">Resumen del {scopeLabel}</h2>
        </div>
        {pendingPayments === null || pendingPayments === undefined ? (
          <Badge variant="secondary">Calculando balances</Badge>
        ) : pendingPayments === 0 ? (
          <Badge variant="success">Al dia</Badge>
        ) : (
          <Badge variant="warning">
            {pendingPayments === 1 ? "1 pago pendiente" : `${pendingPayments} pagos pendientes`}
          </Badge>
        )}
      </div>

      <div className="relative grid gap-3 py-5 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted/75 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</p>
            <WalletCards className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 truncate text-2xl font-bold tabular-nums" title={total.value}>{total.value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={total.detail}>{total.detail}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Movimientos</p>
            <ReceiptText className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{expenses.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingCount > 0 ? `${pendingCount} sin sincronizar` : "Todos sincronizados"}
          </p>
        </div>
        <div className="rounded-2xl bg-info/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-info">Participantes</p>
            <UsersRound className="h-4 w-4 text-info" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{memberCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">En este {scopeLabel}</p>
        </div>
      </div>

      <div className="relative space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Actividad reciente</h3>
          {pendingCount > 0 ? <span className="text-xs text-muted-foreground">El total no incluye pendientes</span> : null}
        </div>
        {recentExpenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-7 text-center text-sm text-muted-foreground">
            El primer gasto aparecera aqui.
          </div>
        ) : (
          recentExpenses.map((expense) => (
            <div key={expense.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <ReceiptText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-semibold">{expense.description}</p>
                  {expense.pending ? <Badge variant="warning">Pendiente</Badge> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{expense.payerAlias} · {expense.expenseDate}</p>
              </div>
              <p className="shrink-0 font-semibold tabular-nums">{formatAmount(expense.amount, expense.currencyCode)}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
