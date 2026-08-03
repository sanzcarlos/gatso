"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { getCache, setCache } from "@/lib/offline/db";
import { discardPendingExpense, listPendingExpenses, subscribePendingExpenses, type PendingExpense } from "@/lib/offline/sync";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ExpenseFormDialog } from "./expense-form-dialog";
import { ExpenseHistoryDialog } from "./expense-history-dialog";
import { InviteMemberDialog } from "./invite-member-dialog";
import { GroupAuditLogCard } from "./group-audit-log-card";
import { ExpenseStatsCharts, type CurrencyExpenseStats } from "@/components/expense-stats-charts";
import { SettlementCard, type CurrencySettlement } from "@/components/settlement-card";

interface GroupDetail {
  group: {
    id: string;
    name: string;
    inviteCode: string;
    maxMembers: number;
    maxSubgroups: number;
    baseCurrencyCode: string;
  };
  memberCount: number;
  subgroupCount: number;
}

interface Member {
  userId: string;
  alias: string;
  role: "admin" | "member";
}

interface Subgroup {
  id: string;
  name: string;
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

const DETAIL_CACHE_KEY = (groupId: string) => `group-detail:${groupId}`;
const MEMBERS_CACHE_KEY = (groupId: string) => `group-members:${groupId}`;
const SUBGROUPS_CACHE_KEY = (groupId: string) => `group-subgroups:${groupId}`;
const EXPENSES_CACHE_KEY = (groupId: string) => `group-expenses:${groupId}`;
const STATS_CACHE_KEY = (groupId: string) => `group-stats:${groupId}`;
const SETTLEMENTS_CACHE_KEY = (groupId: string) => `group-settlements:${groupId}`;

export default function GroupDetailClient({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [subgroups, setSubgroups] = useState<Subgroup[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [stats, setStats] = useState<CurrencyExpenseStats[] | null>(null);
  const [statsBaseCurrency, setStatsBaseCurrency] = useState<{ code: string; totalConvertedCents: number | null } | null>(
    null,
  );
  const [settlements, setSettlements] = useState<CurrencySettlement[] | null>(null);
  const [convertedOverall, setConvertedOverall] = useState<CurrencySettlement | null>(null);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pendingExpenses, setPendingExpenses] = useState<PendingExpense[]>([]);

  const isAdmin = members?.find((m) => m.userId === currentUserId)?.role === "admin";

  const load = useCallback(async () => {
    try {
      const [detailRes, membersRes, subgroupsRes, expensesRes, statsRes, settlementRes] = await Promise.all([
        apiFetch(`/api/groups/${groupId}`),
        apiFetch(`/api/groups/${groupId}/members`),
        apiFetch(`/api/groups/${groupId}/subgroups`),
        apiFetch(`/api/groups/${groupId}/expenses`),
        apiFetch(`/api/groups/${groupId}/expenses/stats`),
        apiFetch(`/api/groups/${groupId}/settlement`),
      ]);
      if (detailRes.ok) {
        const data = await detailRes.json();
        setDetail(data);
        await setCache(DETAIL_CACHE_KEY(groupId), data);
      }
      if (membersRes.ok) {
        const data = (await membersRes.json()).members;
        setMembers(data);
        await setCache(MEMBERS_CACHE_KEY(groupId), data);
      }
      if (subgroupsRes.ok) {
        const data = (await subgroupsRes.json()).subgroups;
        setSubgroups(data);
        await setCache(SUBGROUPS_CACHE_KEY(groupId), data);
      }
      if (expensesRes.ok) {
        const data = (await expensesRes.json()).expenses;
        setExpenses(data);
        await setCache(EXPENSES_CACHE_KEY(groupId), data);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setStatsBaseCurrency({ code: data.baseCurrencyCode, totalConvertedCents: data.totalConvertedCents });
        await setCache(STATS_CACHE_KEY(groupId), data);
      }
      if (settlementRes.ok) {
        const data = await settlementRes.json();
        setSettlements(data.settlements);
        setConvertedOverall(data.convertedOverall ?? null);
        await setCache(SETTLEMENTS_CACHE_KEY(groupId), data);
      }
      setOffline(false);
    } catch {
      setOffline(true);
      const [cachedDetail, cachedMembers, cachedSubgroups, cachedExpenses, cachedStats, cachedSettlements] =
        await Promise.all([
          getCache<GroupDetail>(DETAIL_CACHE_KEY(groupId)),
          getCache<Member[]>(MEMBERS_CACHE_KEY(groupId)),
          getCache<Subgroup[]>(SUBGROUPS_CACHE_KEY(groupId)),
          getCache<ExpenseRow[]>(EXPENSES_CACHE_KEY(groupId)),
          getCache<{ stats: CurrencyExpenseStats[]; baseCurrencyCode: string; totalConvertedCents: number | null }>(
            STATS_CACHE_KEY(groupId),
          ),
          getCache<{ settlements: CurrencySettlement[]; convertedOverall: CurrencySettlement | null }>(
            SETTLEMENTS_CACHE_KEY(groupId),
          ),
        ]);
      if (cachedDetail) setDetail(cachedDetail);
      if (cachedMembers) setMembers(cachedMembers);
      if (cachedSubgroups) setSubgroups(cachedSubgroups);
      if (cachedExpenses) setExpenses(cachedExpenses);
      if (cachedStats) {
        setStats(cachedStats.stats);
        setStatsBaseCurrency({ code: cachedStats.baseCurrencyCode, totalConvertedCents: cachedStats.totalConvertedCents });
      }
      if (cachedSettlements) {
        setSettlements(cachedSettlements.settlements);
        setConvertedOverall(cachedSettlements.convertedOverall ?? null);
      }
    }
    setPendingExpenses(await listPendingExpenses(groupId));
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribePendingExpenses(() => listPendingExpenses(groupId).then(setPendingExpenses)), [groupId]);

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
      payerAlias: members?.find((m) => m.userId === pending.payload.payerId)?.alias ?? "?",
      payerHasLeftGroup: false,
      pendingLocalId: pending.localId,
    }));
    return [...pendingRows, ...(expenses ?? [])];
  }, [expenses, pendingExpenses, members, currentUserId]);

  async function handleDiscardPending(localId: string) {
    await discardPendingExpense(localId);
    toast.success("Gasto pendiente descartado");
  }

  async function handleCreateSubgroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingSubgroup(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/subgroups`, {
        method: "POST",
        body: JSON.stringify({ name: newSubgroupName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear el subgrupo");
        return;
      }
      setNewSubgroupName("");
      toast.success("Subgrupo creado");
      await load();
    } finally {
      setCreatingSubgroup(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    const response = await apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo eliminar al miembro");
      return;
    }
    toast.success("Miembro eliminado");
    await load();
  }

  async function handleLeaveGroup() {
    if (!window.confirm("¿Seguro que quieres abandonar este grupo? Tus gastos ya registrados no se borraran.")) {
      return;
    }
    setLeavingGroup(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/leave`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo abandonar el grupo");
        return;
      }
      toast.success("Has abandonado el grupo");
      router.push("/groups");
    } finally {
      setLeavingGroup(false);
    }
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

  return (
    <div className="flex flex-col gap-6">
      {offline ? <OfflineBanner hasCachedData /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.group.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Moneda base: {detail.group.baseCurrencyCode}</Badge>
          <Badge variant="outline" className="font-mono text-sm">
            {detail.group.inviteCode}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleLeaveGroup} disabled={leavingGroup}>
            {leavingGroup ? "Abandonando..." : "Abandonar grupo"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {detail.memberCount} / {detail.group.maxMembers} miembros · {detail.subgroupCount} /{" "}
        {detail.group.maxSubgroups} subgrupos
      </p>

      <CollapsibleCard title="Estadisticas" description="Vista total del grupo: gastos pagados y reparto por miembro.">
        <ExpenseStatsCharts
          stats={stats}
          baseCurrencyCode={statsBaseCurrency?.code}
          totalConvertedCents={statsBaseCurrency?.totalConvertedCents}
        />
      </CollapsibleCard>

      <SettlementCard settlements={settlements} convertedOverall={convertedOverall} />

      <CollapsibleCard
        title="Gastos"
        description="Historial de gastos del grupo, mas recientes primero."
        headerExtra={
          members ? (
            <ExpenseFormDialog
              groupId={groupId}
              members={members.map((m) => ({ userId: m.userId, alias: m.alias }))}
              subgroups={subgroups ?? []}
              onSaved={load}
              groupBaseCurrencyCode={detail.group.baseCurrencyCode}
            />
          ) : null
        }
      >
        {displayExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavia no hay gastos registrados.</p>
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
                const canDelete = !pendingLocalId && (isAdmin || expense.createdBy === currentUserId);
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
                        {canEdit && members ? (
                          <ExpenseFormDialog
                            groupId={groupId}
                            members={members.map((m) => ({ userId: m.userId, alias: m.alias }))}
                            subgroups={subgroups ?? []}
                            onSaved={load}
                            editExpenseId={expense.id}
                            groupBaseCurrencyCode={detail.group.baseCurrencyCode}
                          />
                        ) : null}
                        {!pendingLocalId ? <ExpenseHistoryDialog groupId={groupId} expenseId={expense.id} /> : null}
                        {canDelete ? (
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

      <CollapsibleCard title="Miembros" headerExtra={<InviteMemberDialog groupId={groupId} />}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Alias</TableHead>
              <TableHead>Rol</TableHead>
              {isAdmin ? <TableHead className="text-right">Acciones</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <Link
                    href={`/users/${member.userId}`}
                    className="flex items-center gap-2 text-foreground underline-offset-4 hover:underline"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback>{member.alias.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {member.alias}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                    {member.role === "admin" ? "Administrador" : "Miembro"}
                  </Badge>
                </TableCell>
                {isAdmin ? (
                  <TableCell className="text-right">
                    {member.userId !== currentUserId ? (
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.userId)}>
                        Eliminar
                      </Button>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CollapsibleCard>

      <CollapsibleCard title="Subgrupos" description="Cualquier miembro del grupo puede crear subgrupos.">
        <div className="flex flex-col gap-4">
          {subgroups && subgroups.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {subgroups.map((subgroup) => (
                <li key={subgroup.id}>
                  <Link href={`/groups/${groupId}/subgroups/${subgroup.id}`}>
                    <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                      {subgroup.name}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Todavia no hay subgrupos.</p>
          )}
        </div>
        <form onSubmit={handleCreateSubgroup} className="flex flex-col gap-2 pt-4">
          <Label htmlFor="new-subgroup-name">Nuevo subgrupo</Label>
          <div className="flex gap-2">
            <Input
              id="new-subgroup-name"
              value={newSubgroupName}
              onChange={(e) => setNewSubgroupName(e.target.value)}
              placeholder="Fin de semana"
              maxLength={64}
              required
            />
            <Button type="submit" disabled={creatingSubgroup}>
              {creatingSubgroup ? "Creando..." : "Crear"}
            </Button>
          </div>
        </form>
      </CollapsibleCard>

      {isAdmin ? <GroupAuditLogCard groupId={groupId} /> : null}
    </div>
  );
}
