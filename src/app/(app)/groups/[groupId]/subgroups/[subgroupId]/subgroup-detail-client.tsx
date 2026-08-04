"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { getCache, setCache } from "@/lib/offline/db";
import { discardPendingExpense, listPendingExpenses, subscribePendingExpenses, type PendingExpense } from "@/lib/offline/sync";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft } from "lucide-react";
import { ExpenseFormDialog } from "../../expense-form-dialog";
import { ExpenseHistoryDialog } from "../../expense-history-dialog";
import { ExpenseStatsCharts, type CurrencyExpenseStats } from "@/components/expense-stats-charts";
import { SettlementCard, type CurrencySettlement } from "@/components/settlement-card";
import { GroupSummaryCard, type SummaryExpense } from "@/components/group-summary-card";

interface SubgroupDetail {
  subgroup: { id: string; name: string; groupId: string };
  members: { userId: string; alias: string }[];
  groupBaseCurrencyCode?: string;
}

interface ExpenseRow {
  expense: {
    id: string;
    amount: string;
    currencyCode: string;
    description: string;
    expenseDate: string;
    splitMethod: "equal" | "percentage" | "fixed";
    createdBy: string;
    payerId: string;
    status: "confirmed" | "modified" | "pending_validation";
  };
  payerAlias: string;
  payerHasLeftGroup: boolean;
  groupBaseCurrencyCode?: string;
  convertedAmount?: string | null;
}

const SPLIT_METHOD_LABEL: Record<ExpenseRow["expense"]["splitMethod"], string> = {
  equal: "Partes iguales",
  percentage: "Porcentajes",
  fixed: "Importes fijos",
};

const STATUS_LABEL: Record<ExpenseRow["expense"]["status"], string> = {
  confirmed: "Confirmado",
  modified: "Modificado",
  pending_validation: "Pendiente de validar",
};

const STATUS_VARIANT: Record<ExpenseRow["expense"]["status"], "outline" | "secondary" | "warning"> = {
  confirmed: "outline",
  modified: "secondary",
  pending_validation: "warning",
};

const SUBGROUP_DETAIL_CACHE_KEY = (subgroupId: string) => `subgroup-detail:${subgroupId}`;
const SUBGROUP_EXPENSES_CACHE_KEY = (subgroupId: string) => `subgroup-expenses:${subgroupId}`;
const SUBGROUP_STATS_CACHE_KEY = (subgroupId: string) => `subgroup-stats:${subgroupId}`;
const SUBGROUP_SETTLEMENTS_CACHE_KEY = (subgroupId: string) => `subgroup-settlements:${subgroupId}`;
const SUBGROUP_ADMIN_CACHE_KEY = (groupId: string) => `group-is-admin:${groupId}`;

export default function SubgroupDetailClient({
  groupId,
  subgroupId,
  currentUserId,
}: {
  groupId: string;
  subgroupId: string;
  currentUserId: string;
}) {
  const [detail, setDetail] = useState<SubgroupDetail | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [stats, setStats] = useState<CurrencyExpenseStats[] | null>(null);
  const [statsBaseCurrency, setStatsBaseCurrency] = useState<{ code: string; totalConvertedCents: number | null } | null>(
    null,
  );
  const [settlements, setSettlements] = useState<CurrencySettlement[] | null>(null);
  const [convertedOverall, setConvertedOverall] = useState<CurrencySettlement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);

  const load = useCallback(async () => {
    try {
      const [detailRes, expensesRes, statsRes, membersRes, settlementRes] = await Promise.all([
        apiFetch(`/api/groups/${groupId}/subgroups/${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/expenses?subgroupId=${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/expenses/stats?subgroupId=${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/members`),
        apiFetch(`/api/groups/${groupId}/settlement?subgroupId=${subgroupId}`),
      ]);
      if (!detailRes.ok) {
        if (detailRes.status === 404) setNotFound(true);
        setOffline(false);
        return;
      }
      const detailData = await detailRes.json();
      setDetail(detailData);
      await setCache(SUBGROUP_DETAIL_CACHE_KEY(subgroupId), detailData);
      if (expensesRes.ok) {
        const data = (await expensesRes.json()).expenses;
        setExpenses(data);
        await setCache(SUBGROUP_EXPENSES_CACHE_KEY(subgroupId), data);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setStatsBaseCurrency({ code: data.baseCurrencyCode, totalConvertedCents: data.totalConvertedCents });
        await setCache(SUBGROUP_STATS_CACHE_KEY(subgroupId), data);
      }
      if (settlementRes.ok) {
        const data = await settlementRes.json();
        setSettlements(data.settlements);
        setConvertedOverall(data.convertedOverall ?? null);
        await setCache(SUBGROUP_SETTLEMENTS_CACHE_KEY(subgroupId), data);
      }
      if (membersRes.ok) {
        const data = await membersRes.json();
        const role = data.members?.find((m: { userId: string; role: string }) => m.userId === currentUserId)?.role;
        const admin = role === "admin";
        setIsAdmin(admin);
        await setCache(SUBGROUP_ADMIN_CACHE_KEY(groupId), admin);
      }
      setOffline(false);
    } catch {
      setOffline(true);
      const [cachedDetail, cachedExpenses, cachedStats, cachedSettlements, cachedAdmin] = await Promise.all([
        getCache<SubgroupDetail>(SUBGROUP_DETAIL_CACHE_KEY(subgroupId)),
        getCache<ExpenseRow[]>(SUBGROUP_EXPENSES_CACHE_KEY(subgroupId)),
        getCache<{ stats: CurrencyExpenseStats[]; baseCurrencyCode: string; totalConvertedCents: number | null }>(
          SUBGROUP_STATS_CACHE_KEY(subgroupId),
        ),
        getCache<{ settlements: CurrencySettlement[]; convertedOverall: CurrencySettlement | null }>(
          SUBGROUP_SETTLEMENTS_CACHE_KEY(subgroupId),
        ),
        getCache<boolean>(SUBGROUP_ADMIN_CACHE_KEY(groupId)),
      ]);
      if (cachedDetail) setDetail(cachedDetail);
      if (cachedExpenses) setExpenses(cachedExpenses);
      if (cachedStats) {
        setStats(cachedStats.stats);
        setStatsBaseCurrency({ code: cachedStats.baseCurrencyCode, totalConvertedCents: cachedStats.totalConvertedCents });
      }
      if (cachedSettlements) {
        setSettlements(cachedSettlements.settlements);
        setConvertedOverall(cachedSettlements.convertedOverall ?? null);
      }
      if (cachedAdmin !== null) setIsAdmin(cachedAdmin);
    }
    const pending = await listPendingExpenses(groupId);
    setPendingExpenses(pending.filter((item) => item.payload.subgroupId === subgroupId));
  }, [groupId, subgroupId, currentUserId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribePendingExpenses(() =>
        listPendingExpenses(groupId).then((pending) =>
          setPendingExpenses(pending.filter((item) => item.payload.subgroupId === subgroupId)),
        ),
      ),
    [groupId, subgroupId],
  );

  const displayExpenses = useMemo<(ExpenseRow & { pendingLocalId?: string })[]>(() => {
    const pendingRows: (ExpenseRow & { pendingLocalId?: string })[] = pendingExpenses.map((pending) => ({
      expense: {
        id: pending.localId,
        amount: pending.payload.amount,
        currencyCode: pending.payload.currencyCode,
        description: pending.payload.description,
        expenseDate: pending.payload.expenseDate,
        splitMethod: pending.payload.split.method,
        createdBy: currentUserId,
        payerId: pending.payload.payerId,
        status: "confirmed",
      },
      payerAlias: detail?.members.find((m) => m.userId === pending.payload.payerId)?.alias ?? "?",
      payerHasLeftGroup: false,
      pendingLocalId: pending.localId,
    }));
    return [...pendingRows, ...(expenses ?? [])];
  }, [expenses, pendingExpenses, detail, currentUserId]);

  async function handleDiscardPending(localId: string) {
    await discardPendingExpense(localId);
    toast.success("Gasto pendiente descartado");
  }

  async function handleDeleteExpense(expenseId: string) {
    try {
      const response = await apiFetch(`/api/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo borrar el gasto");
        return;
      }
      toast.success("Gasto borrado");
      await load();
    } catch {
      toast.error("Sin conexion: no se puede borrar este gasto ahora");
    }
  }

  async function handleValidateExpense(expenseId: string) {
    try {
      const response = await apiFetch(`/api/groups/${groupId}/expenses/${expenseId}/validate`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo validar el gasto");
        return;
      }
      toast.success("Cambios validados");
      await load();
    } catch {
      toast.error("Sin conexion: no se puede validar este gasto ahora");
    }
  }

  function renderSummaryExpenseActions(expense: SummaryExpense) {
    if (expense.pending) {
      return <Button variant="ghost" size="sm" onClick={() => handleDiscardPending(expense.id)}>Descartar</Button>;
    }
    const canEdit = isAdmin || expense.createdBy === currentUserId;
    const canValidate = expense.status === "pending_validation" && expense.createdBy === currentUserId;
    return (
      <>
        {canValidate ? <Button variant="ghost" size="sm" onClick={() => handleValidateExpense(expense.id)}>Validar</Button> : null}
        {canEdit && detail ? (
          <ExpenseFormDialog
            groupId={groupId}
            members={detail.members}
            subgroups={[]}
            onSaved={load}
            editExpenseId={expense.id}
            lockedSubgroupId={subgroupId}
            groupBaseCurrencyCode={detail.groupBaseCurrencyCode}
          />
        ) : null}
        <ExpenseHistoryDialog groupId={groupId} expenseId={expense.id} />
        {canEdit ? <Button variant="ghost" size="sm" onClick={() => handleDeleteExpense(expense.id)}>Borrar</Button> : null}
      </>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Este subgrupo no existe o no perteneces a el.</p>
        <Button variant="outline" asChild className="w-fit">
          <Link href={`/groups/${groupId}`}>
            <ChevronLeft />
            Volver al grupo
          </Link>
        </Button>
      </div>
    );
  }

  if (!detail) {
    if (offline) {
      return (
        <div className="flex flex-col gap-4">
          <OfflineBanner hasCachedData={false} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const members = detail.members;

  return (
    <div className="flex flex-col gap-6">
      {offline ? <OfflineBanner hasCachedData /> : null}

      <div>
        <Link
          href={`/groups/${groupId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver al grupo
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.subgroup.name}</h1>
        <Badge variant="secondary">Subgrupo</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((member) => (
          <Link key={member.userId} href={`/users/${member.userId}`}>
            <Badge variant="outline" className="flex items-center gap-1.5 hover:bg-accent">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[9px]">{member.alias.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {member.alias}
            </Badge>
          </Link>
        ))}
      </div>

      <GroupSummaryCard
        name={detail.subgroup.name}
        scopeLabel="subgrupo"
        expenses={displayExpenses.map(({ expense, payerAlias, pendingLocalId }) => ({
          id: expense.id,
          amount: expense.amount,
          currencyCode: expense.currencyCode,
          description: expense.description,
          expenseDate: expense.expenseDate,
          payerAlias,
          payerId: expense.payerId,
          createdBy: expense.createdBy,
          status: expense.status,
          splitMethod: expense.splitMethod,
          pending: Boolean(pendingLocalId),
        }))}
        stats={stats}
        baseCurrencyCode={statsBaseCurrency?.code ?? detail.groupBaseCurrencyCode ?? "EUR"}
        totalConvertedCents={statsBaseCurrency?.totalConvertedCents ?? null}
        participants={members.map((member) => ({ userId: member.userId, alias: member.alias }))}
        settlements={settlements}
        convertedOverall={convertedOverall}
        settlementGroupId={groupId}
        settlementSubgroupId={subgroupId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onSettlementPaid={load}
        subgroups={[]}
        pendingCount={pendingExpenses.length}
        expenseAction={
          <ExpenseFormDialog
            groupId={groupId}
            members={members}
            subgroups={[]}
            onSaved={load}
            lockedSubgroupId={subgroupId}
            groupBaseCurrencyCode={detail.groupBaseCurrencyCode}
          />
        }
        renderExpenseActions={renderSummaryExpenseActions}
      />

      <div className="hidden" aria-hidden="true">
      <CollapsibleCard title="Estadisticas" description="Gastos pagados y reparto por miembro dentro de este subgrupo.">
        <ExpenseStatsCharts
          stats={stats}
          baseCurrencyCode={statsBaseCurrency?.code}
          totalConvertedCents={statsBaseCurrency?.totalConvertedCents}
        />
      </CollapsibleCard>

      <SettlementCard settlements={settlements} convertedOverall={convertedOverall} />

      <CollapsibleCard
        title="Gastos"
        description="Gastos de este subgrupo, mas recientes primero."
        headerExtra={
          <ExpenseFormDialog
            groupId={groupId}
            members={members}
            subgroups={[]}
            onSaved={load}
            lockedSubgroupId={subgroupId}
            groupBaseCurrencyCode={detail.groupBaseCurrencyCode}
          />
        }
      >
        {displayExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavia no hay gastos registrados en este subgrupo.</p>
        ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead>Pagador</TableHead>
                  <TableHead>Reparto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayExpenses.map(({ expense, payerAlias, payerHasLeftGroup, pendingLocalId, convertedAmount, groupBaseCurrencyCode }) => {
                  const canEdit = !pendingLocalId && (isAdmin || expense.createdBy === currentUserId);
                  const canValidate =
                    !pendingLocalId && expense.status === "pending_validation" && expense.createdBy === currentUserId;
                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="whitespace-nowrap">{expense.expenseDate}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>
                        <Link
                          href={`/users/${expense.payerId}`}
                          className="text-foreground underline-offset-4 hover:underline"
                        >
                          {payerAlias}
                        </Link>
                        {payerHasLeftGroup ? (
                          <Badge variant="outline" className="ml-2">
                            Ha abandonado el grupo
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{SPLIT_METHOD_LABEL[expense.splitMethod]}</Badge>
                      </TableCell>
                      <TableCell>
                        {pendingLocalId ? (
                          <Badge variant="warning">Sin sincronizar</Badge>
                        ) : (
                          <Badge variant={STATUS_VARIANT[expense.status]}>{STATUS_LABEL[expense.status]}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {expense.amount} {expense.currencyCode}
                        {convertedAmount ? (
                          <span className="ml-1 block text-xs font-normal text-muted-foreground">
                            (~{convertedAmount} {groupBaseCurrencyCode})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {pendingLocalId ? (
                            <Button variant="ghost" size="sm" onClick={() => handleDiscardPending(pendingLocalId)}>
                              Descartar
                            </Button>
                          ) : null}
                          {canValidate ? (
                            <Button variant="ghost" size="sm" onClick={() => handleValidateExpense(expense.id)}>
                              Validar
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <ExpenseFormDialog
                              groupId={groupId}
                              members={members}
                              subgroups={[]}
                              onSaved={load}
                              editExpenseId={expense.id}
                              lockedSubgroupId={subgroupId}
                              groupBaseCurrencyCode={detail.groupBaseCurrencyCode}
                            />
                          ) : null}
                          {!pendingLocalId ? <ExpenseHistoryDialog groupId={groupId} expenseId={expense.id} /> : null}
                          {canEdit ? (
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteExpense(expense.id)}>
                              Borrar
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        )}
      </CollapsibleCard>
      </div>
    </div>
  );
}
