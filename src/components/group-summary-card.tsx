"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRightLeft, ChevronLeft, ChevronRight, FolderKanban, ReceiptText, Search, UsersRound, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExpenseStatsCharts, type CurrencyExpenseStats } from "@/components/expense-stats-charts";
import { SettlementCard, type CurrencySettlement } from "@/components/settlement-card";

const PAGE_SIZE = 5;

export interface SummaryExpense {
  id: string;
  amount: string;
  currencyCode: string;
  description: string;
  notes?: string | null;
  expenseDate: string;
  payerDisplayName: string;
  payerId?: string;
  createdBy?: string;
  status?: "confirmed" | "modified" | "pending_validation";
  splitMethod?: "equal" | "percentage" | "fixed";
  pending?: boolean;
}

export interface SummaryParticipant {
  userId: string;
  displayName: string;
  role?: "admin" | "member";
}

export interface SummarySubgroup {
  id: string;
  name: string;
  href: string;
}

function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currencyCode }).format(cents / 100);
}

function formatAmount(amount: string, currencyCode: string): string {
  const value = Number(amount);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("es-ES", { style: "currency", currency: currencyCode }).format(value)
    : `${amount} ${currencyCode}`;
}

function getTotalLabel(
  stats: CurrencyExpenseStats[] | null,
  baseCurrencyCode: string,
  totalConvertedCents: number | null | undefined,
): { value: string; detail: string } {
  if (stats === null) return { value: "Cargando...", detail: "Calculando el total" };
  if (stats.length === 0) return { value: formatCents(0, baseCurrencyCode), detail: "Sin gastos registrados" };
  if (stats.length === 1) {
    const item = stats[0]!;
    return { value: formatCents(item.totalCents, item.currencyCode), detail: "Total registrado" };
  }
  if (totalConvertedCents !== null && totalConvertedCents !== undefined) {
    return { value: formatCents(totalConvertedCents, baseCurrencyCode), detail: `Convertido a ${baseCurrencyCode}` };
  }
  return { value: `${stats.length} monedas`, detail: "Consulta el desglose" };
}

function statusLabel(expense: SummaryExpense): string {
  if (expense.pending) return "Sin sincronizar";
  if (expense.status === "pending_validation") return "Pendiente de validar";
  if (expense.status === "modified") return "Modificado";
  return "Confirmado";
}

function statusVariant(expense: SummaryExpense): "outline" | "secondary" | "warning" {
  if (expense.pending || expense.status === "pending_validation") return "warning";
  if (expense.status === "modified") return "secondary";
  return "outline";
}

export function GroupSummaryCard({
  name,
  scopeLabel,
  expenses,
  stats,
  baseCurrencyCode,
  totalConvertedCents,
  participants,
  settlements,
  convertedOverall,
  settlementGroupId,
  settlementSubgroupId,
  currentUserId,
  isAdmin = false,
  onSettlementPaid,
  subgroups,
  pendingCount = 0,
  expenseAction,
  participantAction,
  subgroupAction,
  renderExpenseActions,
  renderParticipantActions,
}: {
  name: string;
  scopeLabel: "grupo" | "subgrupo";
  expenses: SummaryExpense[];
  stats: CurrencyExpenseStats[] | null;
  baseCurrencyCode: string;
  totalConvertedCents?: number | null;
  participants: SummaryParticipant[];
  settlements: CurrencySettlement[] | null;
  convertedOverall: CurrencySettlement | null;
  settlementGroupId?: string | undefined;
  settlementSubgroupId?: string | undefined;
  currentUserId?: string | undefined;
  isAdmin?: boolean;
  onSettlementPaid?: (() => Promise<void> | void) | undefined;
  subgroups: SummarySubgroup[];
  pendingCount?: number;
  expenseAction?: ReactNode;
  participantAction?: ReactNode;
  subgroupAction?: ReactNode;
  renderExpenseActions?: (expense: SummaryExpense) => ReactNode;
  renderParticipantActions?: (participant: SummaryParticipant) => ReactNode;
}) {
  const [activeDialog, setActiveDialog] = useState<"total" | "settlement" | "movements" | "participants" | "subgroups" | null>(null);
  const [query, setQuery] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const total = getTotalLabel(stats, baseCurrencyCode, totalConvertedCents);
  const pendingPayments = settlements?.reduce((sum, item) => sum + item.transactions.length, 0);
  const recentExpenses = expenses.slice(0, 3);
  const currencies = useMemo(() => [...new Set(expenses.map((expense) => expense.currencyCode))].sort(), [expenses]);
  const filteredExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return expenses.filter((expense) => {
      const matchesQuery =
        !normalizedQuery ||
        expense.description.toLocaleLowerCase("es").includes(normalizedQuery) ||
        expense.payerDisplayName.toLocaleLowerCase("es").includes(normalizedQuery);
      const matchesCurrency = currencyFilter === "all" || expense.currencyCode === currencyFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "pending" ? expense.pending : !expense.pending && expense.status === statusFilter);
      return matchesQuery && matchesCurrency && matchesStatus;
    });
  }, [expenses, query, currencyFilter, statusFilter]);

  useEffect(() => setPage(1), [query, currencyFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredExpenses.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedExpenses = filteredExpenses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] border border-border/80 bg-card/85 p-5 shadow-lg backdrop-blur-xl sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{name}</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">Resumen del {scopeLabel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingPayments === null || pendingPayments === undefined ? (
              <Badge variant="secondary">Calculando balances</Badge>
            ) : pendingPayments === 0 ? (
              <Badge variant="success">Al dia</Badge>
            ) : (
              <Badge variant="warning">{pendingPayments === 1 ? "1 pago pendiente" : `${pendingPayments} pagos pendientes`}</Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => setActiveDialog("settlement")}>
              <ArrowRightLeft />
              Liquidacion
            </Button>
            {expenseAction}
          </div>
        </div>

        <div className="relative grid gap-3 py-5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricButton
            title="Total"
            value={total.value}
            detail={total.detail}
            icon={<WalletCards />}
            tone="muted"
            onClick={() => setActiveDialog("total")}
          />
          <MetricButton
            title="Movimientos"
            value={String(expenses.length)}
            detail={pendingCount > 0 ? `${pendingCount} sin sincronizar` : "Todos sincronizados"}
            icon={<ReceiptText />}
            tone="primary"
            onClick={() => setActiveDialog("movements")}
          />
          <MetricButton
            title="Participantes"
            value={String(participants.length)}
            detail={`En este ${scopeLabel}`}
            icon={<UsersRound />}
            tone="info"
            onClick={() => setActiveDialog("participants")}
          />
          <MetricButton
            title="Subgrupos"
            value={String(subgroups.length)}
            detail={scopeLabel === "subgrupo" ? "No admite niveles internos" : "Espacios disponibles"}
            icon={<FolderKanban />}
            tone="secondary"
            onClick={() => setActiveDialog("subgroups")}
          />
        </div>

        <div className="relative space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Actividad reciente</h3>
            {pendingCount > 0 ? <span className="text-right text-xs text-muted-foreground">El total no incluye pendientes</span> : null}
          </div>
          {recentExpenses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-7 text-center text-sm text-muted-foreground">El primer gasto aparecera aqui.</div>
          ) : (
            recentExpenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} />)
          )}
        </div>
      </section>

      <Dialog open={activeDialog === "total"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Analisis de gastos</DialogTitle>
            <DialogDescription>Distribucion de lo pagado y lo repartido en {name}.</DialogDescription>
          </DialogHeader>
          <ExpenseStatsCharts stats={stats} baseCurrencyCode={baseCurrencyCode} totalConvertedCents={totalConvertedCents} />
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === "settlement"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Liquidacion</DialogTitle>
            <DialogDescription>
              {scopeLabel === "grupo" && subgroups.length > 0
                ? "Resumen global. Las deudas se marcan como pagadas dentro de cada subgrupo."
                : `La forma mas sencilla de saldar las deudas pendientes de ${name}.`}
            </DialogDescription>
          </DialogHeader>
          <SettlementCard
            settlements={settlements}
            convertedOverall={convertedOverall}
            groupId={settlementGroupId}
            subgroupId={settlementSubgroupId}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            onPaid={onSettlementPaid}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === "movements"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Movimientos</DialogTitle>
            <DialogDescription>Consulta y filtra los gastos de {name}. Se muestran como maximo 5 por pagina.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar descripcion o pagador" className="pl-9" />
            </div>
            <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
              <SelectTrigger aria-label="Filtrar por moneda"><SelectValue placeholder="Moneda" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todas</SelectItem>{currencies.map((currency) => <SelectItem key={currency} value={currency}>{currency}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filtrar por estado"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="confirmed">Confirmados</SelectItem>
                <SelectItem value="modified">Modificados</SelectItem>
                <SelectItem value="pending_validation">Por validar</SelectItem>
                <SelectItem value="pending">Sin sincronizar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            {pagedExpenses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay movimientos que coincidan con los filtros.</div>
            ) : pagedExpenses.map((expense) => (
              <div key={expense.id} className="rounded-xl border border-border/70 bg-background/60 p-3">
                <ExpenseRow expense={expense} showStatus />
                {renderExpenseActions ? <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-border/70 pt-3">{renderExpenseActions(expense)}</div> : null}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{filteredExpenses.length} resultados · Pagina {safePage} de {pageCount}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft /> Anterior</Button>
              <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente <ChevronRight /></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === "participants"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div><DialogTitle>Participantes</DialogTitle><DialogDescription className="mt-1">Todas las personas incluidas en este {scopeLabel}.</DialogDescription></div>
              {participantAction}
            </div>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {participants.map((participant) => (
              <div key={participant.userId} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                <Link href={`/users/${participant.userId}`} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{participant.displayName.slice(0, 2).toUpperCase()}</Link>
                <div className="min-w-0 flex-1"><Link href={`/users/${participant.userId}`} className="truncate font-semibold hover:underline">{participant.displayName}</Link>{participant.role ? <p className="text-xs text-muted-foreground">{participant.role === "admin" ? "Administrador" : "Miembro"}</p> : null}</div>
                {renderParticipantActions?.(participant)}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeDialog === "subgroups"} onOpenChange={(open) => !open && setActiveDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Subgrupos</DialogTitle><DialogDescription>{scopeLabel === "subgrupo" ? "Los subgrupos no contienen otros niveles internos." : `Espacios disponibles dentro de ${name}.`}</DialogDescription></DialogHeader>
          {subgroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Todavia no hay subgrupos.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">{subgroups.map((subgroup) => <Link key={subgroup.id} href={subgroup.href as Route} className="group flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-4 font-semibold transition-colors hover:border-primary/30 hover:bg-accent/40"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban className="h-4 w-4" /></span>{subgroup.name}</span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></Link>)}</div>
          )}
          {subgroupAction ? <div className="border-t border-border pt-4">{subgroupAction}</div> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricButton({ title, value, detail, icon, tone, onClick }: { title: string; value: string; detail: string; icon: ReactNode; tone: "muted" | "primary" | "info" | "secondary"; onClick: () => void }) {
  const toneClass = { muted: "bg-muted/75", primary: "bg-primary/10", info: "bg-info/10", secondary: "bg-secondary/80" }[tone];
  const accentClass = { muted: "text-muted-foreground", primary: "text-primary", info: "text-info", secondary: "text-secondary-foreground" }[tone];
  return <button type="button" onClick={onClick} className={`group rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}><div className="flex items-center justify-between gap-2"><p className={`text-xs font-semibold uppercase tracking-wide ${accentClass}`}>{title}</p><span className={`[&_svg]:h-4 [&_svg]:w-4 ${accentClass}`}>{icon}</span></div><p className="mt-2 truncate text-2xl font-bold tabular-nums" title={value}>{value}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={detail}>{detail}</p></button>;
}

function ExpenseRow({ expense, showStatus = false }: { expense: SummaryExpense; showStatus?: boolean }) {
  return <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ReceiptText className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{expense.description}</p>{showStatus ? <Badge variant={statusVariant(expense)}>{statusLabel(expense)}</Badge> : expense.pending ? <Badge variant="warning">Pendiente</Badge> : null}</div><p className="truncate text-xs text-muted-foreground">{expense.payerDisplayName} · {expense.expenseDate}</p>{showStatus && expense.notes ? <p className="mt-0.5 truncate text-xs text-muted-foreground" title={expense.notes}>💬 {expense.notes}</p> : null}</div><p className="shrink-0 font-semibold tabular-nums">{formatAmount(expense.amount, expense.currencyCode)}</p></div>;
}
