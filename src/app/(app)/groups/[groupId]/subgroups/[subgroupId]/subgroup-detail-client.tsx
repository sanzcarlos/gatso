"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { fetchAllExpenses } from "@/lib/expenses/fetch-all";
import { getCache, setCache } from "@/lib/offline/db";
import { discardPendingExpense, listPendingExpenses, subscribePendingExpenses, type PendingExpense } from "@/lib/offline/sync";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { getAvailableSubgroupMembers } from "@/lib/groups/subgroup-members";

interface SubgroupDetail {
  subgroup: { id: string; name: string; groupId: string };
  members: { userId: string; displayName: string }[];
  groupBaseCurrencyCode?: string;
}

interface SubgroupOption {
  id: string;
  name: string;
}

interface GroupMember {
  userId: string;
  displayName: string;
  role: "admin" | "member";
}

interface ExpenseRow {
  expense: {
    id: string;
    amount: string;
    currencyCode: string;
    description: string;
    notes: string | null;
    expenseDate: string;
    splitMethod: "equal" | "percentage" | "fixed";
    createdBy: string;
    payerId: string;
    status: "confirmed" | "modified" | "pending_validation";
  };
  payerDisplayName: string;
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
const GROUP_SUBGROUPS_CACHE_KEY = (groupId: string) => `group-subgroups:${groupId}`;

export default function SubgroupDetailClient({
  groupId,
  subgroupId,
  currentUserId,
}: {
  groupId: string;
  subgroupId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<SubgroupDetail | null>(null);
  const [availableSubgroups, setAvailableSubgroups] = useState<SubgroupOption[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [updatingMember, setUpdatingMember] = useState(false);
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
      const [detailRes, statsRes, membersRes, settlementRes, subgroupsRes] = await Promise.all([
        apiFetch(`/api/groups/${groupId}/subgroups/${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/expenses/stats?subgroupId=${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/members`),
        apiFetch(`/api/groups/${groupId}/settlement?subgroupId=${subgroupId}`),
        apiFetch(`/api/groups/${groupId}/subgroups`),
      ]);
      if (!detailRes.ok) {
        if (detailRes.status === 404) setNotFound(true);
        setOffline(false);
        return;
      }
      const detailData = await detailRes.json();
      setDetail(detailData);
      await setCache(SUBGROUP_DETAIL_CACHE_KEY(subgroupId), detailData);
      const expensesData = await fetchAllExpenses(groupId, subgroupId);
      if (expensesData) {
        setExpenses(expensesData as ExpenseRow[]);
        await setCache(SUBGROUP_EXPENSES_CACHE_KEY(subgroupId), expensesData);
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
        const loadedMembers = (data.members ?? []) as GroupMember[];
        setGroupMembers(loadedMembers);
        const role = loadedMembers.find((member) => member.userId === currentUserId)?.role;
        const admin = role === "admin";
        setIsAdmin(admin);
        await setCache(SUBGROUP_ADMIN_CACHE_KEY(groupId), admin);
      }
      if (subgroupsRes.ok) {
        const data = (await subgroupsRes.json()).subgroups as SubgroupOption[];
        setAvailableSubgroups(data);
        await setCache(GROUP_SUBGROUPS_CACHE_KEY(groupId), data);
      }
      setOffline(false);
    } catch {
      setOffline(true);
      const [cachedDetail, cachedExpenses, cachedStats, cachedSettlements, cachedAdmin, cachedSubgroups] = await Promise.all([
        getCache<SubgroupDetail>(SUBGROUP_DETAIL_CACHE_KEY(subgroupId)),
        getCache<ExpenseRow[]>(SUBGROUP_EXPENSES_CACHE_KEY(subgroupId)),
        getCache<{ stats: CurrencyExpenseStats[]; baseCurrencyCode: string; totalConvertedCents: number | null }>(
          SUBGROUP_STATS_CACHE_KEY(subgroupId),
        ),
        getCache<{ settlements: CurrencySettlement[]; convertedOverall: CurrencySettlement | null }>(
          SUBGROUP_SETTLEMENTS_CACHE_KEY(subgroupId),
        ),
        getCache<boolean>(SUBGROUP_ADMIN_CACHE_KEY(groupId)),
        getCache<SubgroupOption[]>(GROUP_SUBGROUPS_CACHE_KEY(groupId)),
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
      if (cachedSubgroups) setAvailableSubgroups(cachedSubgroups);
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
        notes: pending.payload.notes ?? null,
        expenseDate: pending.payload.expenseDate,
        splitMethod: pending.payload.split.method,
        createdBy: currentUserId,
        payerId: pending.payload.payerId,
        status: "confirmed",
      },
      payerDisplayName: detail?.members.find((m) => m.userId === pending.payload.payerId)?.displayName ?? "?",
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

  async function handleAddMember() {
    if (!selectedMemberId) return;
    setUpdatingMember(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/subgroups/${subgroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedMemberId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo agregar el usuario al subgrupo");
        return;
      }
      setSelectedMemberId("");
      toast.success("Usuario agregado al subgrupo");
      await load();
    } catch {
      toast.error("Sin conexion: no se puede agregar el usuario ahora");
    } finally {
      setUpdatingMember(false);
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    setUpdatingMember(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/subgroups/${subgroupId}/members/${targetUserId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo quitar el usuario del subgrupo");
        return;
      }
      toast.success("Usuario eliminado del subgrupo");
      await load();
    } catch {
      toast.error("Sin conexion: no se puede quitar el usuario ahora");
    } finally {
      setUpdatingMember(false);
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
  const availableMembers = getAvailableSubgroupMembers(groupMembers, members);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.subgroup.name}</h1>
        <div className="flex items-center gap-2">
          {availableSubgroups.length > 1 ? (
            <Select
              value={subgroupId}
              onValueChange={(nextSubgroupId) => router.push(`/groups/${groupId}/subgroups/${nextSubgroupId}`)}
            >
              <SelectTrigger className="w-56" aria-label="Cambiar de subgrupo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableSubgroups.map((subgroup) => (
                  <SelectItem key={subgroup.id} value={subgroup.id}>{subgroup.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Badge variant="secondary">Subgrupo</Badge>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {members.map((member) => (
          <Link key={member.userId} href={`/users/${member.userId}`}>
            <Badge variant="outline" className="flex items-center gap-1.5 hover:bg-accent">
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-[9px]">{member.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              {member.displayName}
            </Badge>
          </Link>
        ))}
      </div>

      <GroupSummaryCard
        name={detail.subgroup.name}
        scopeLabel="subgrupo"
        expenses={displayExpenses.map(({ expense, payerDisplayName, pendingLocalId }) => ({
          id: expense.id,
          amount: expense.amount,
          currencyCode: expense.currencyCode,
          description: expense.description,
          notes: expense.notes,
          expenseDate: expense.expenseDate,
          payerDisplayName,
          payerId: expense.payerId,
          createdBy: expense.createdBy,
          status: expense.status,
          splitMethod: expense.splitMethod,
          pending: Boolean(pendingLocalId),
        }))}
        stats={stats}
        baseCurrencyCode={statsBaseCurrency?.code ?? detail.groupBaseCurrencyCode ?? "EUR"}
        totalConvertedCents={statsBaseCurrency?.totalConvertedCents ?? null}
        participants={members.map((member) => ({ userId: member.userId, displayName: member.displayName }))}
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
        participantAction={availableMembers.length > 0 ? (
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Usuario del grupo para agregar">
                <SelectValue placeholder="Agregar usuario" />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>{member.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" disabled={!selectedMemberId || updatingMember} onClick={handleAddMember}>
              Agregar
            </Button>
          </div>
        ) : undefined}
        renderParticipantActions={(participant) =>
          isAdmin || participant.userId === currentUserId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={updatingMember}
              onClick={() => handleRemoveMember(participant.userId)}
            >
              Quitar
            </Button>
          ) : null
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
                {displayExpenses.map(({ expense, payerDisplayName, payerHasLeftGroup, pendingLocalId, convertedAmount, groupBaseCurrencyCode }) => {
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
                          {payerDisplayName}
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
