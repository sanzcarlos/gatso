"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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

interface SubgroupDetail {
  subgroup: { id: string; name: string; groupId: string };
  members: { userId: string; alias: string }[];
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
  const [settlements, setSettlements] = useState<CurrencySettlement[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const [detailRes, expensesRes, statsRes, membersRes, settlementRes] = await Promise.all([
      apiFetch(`/api/groups/${groupId}/subgroups/${subgroupId}`),
      apiFetch(`/api/groups/${groupId}/expenses?subgroupId=${subgroupId}`),
      apiFetch(`/api/groups/${groupId}/expenses/stats?subgroupId=${subgroupId}`),
      apiFetch(`/api/groups/${groupId}/members`),
      apiFetch(`/api/groups/${groupId}/settlement?subgroupId=${subgroupId}`),
    ]);
    if (!detailRes.ok) {
      if (detailRes.status === 404) setNotFound(true);
      return;
    }
    setDetail(await detailRes.json());
    if (expensesRes.ok) setExpenses((await expensesRes.json()).expenses);
    if (statsRes.ok) setStats((await statsRes.json()).stats);
    if (settlementRes.ok) setSettlements((await settlementRes.json()).settlements);
    if (membersRes.ok) {
      const data = await membersRes.json();
      const role = data.members?.find((m: { userId: string; role: string }) => m.userId === currentUserId)?.role;
      setIsAdmin(role === "admin");
    }
  }, [groupId, subgroupId, currentUserId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteExpense(expenseId: string) {
    const response = await apiFetch(`/api/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo borrar el gasto");
      return;
    }
    toast.success("Gasto borrado");
    await load();
  }

  async function handleValidateExpense(expenseId: string) {
    const response = await apiFetch(`/api/groups/${groupId}/expenses/${expenseId}/validate`, { method: "POST" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo validar el gasto");
      return;
    }
    toast.success("Cambios validados");
    await load();
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estadisticas</CardTitle>
          <CardDescription>Gastos pagados y reparto por miembro dentro de este subgrupo.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExpenseStatsCharts stats={stats} />
        </CardContent>
      </Card>

      <SettlementCard settlements={settlements} />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Gastos</CardTitle>
            <CardDescription>Gastos de este subgrupo, mas recientes primero.</CardDescription>
          </div>
          <ExpenseFormDialog
            groupId={groupId}
            members={members}
            subgroups={[]}
            onSaved={load}
            lockedSubgroupId={subgroupId}
          />
        </CardHeader>
        <CardContent>
          {expenses === null ? (
            <Skeleton className="h-24 w-full" />
          ) : expenses.length === 0 ? (
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
                {expenses.map(({ expense, payerAlias, payerHasLeftGroup }) => {
                  const canEdit = isAdmin || expense.createdBy === currentUserId;
                  const canValidate = expense.status === "pending_validation" && expense.createdBy === currentUserId;
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
                        <Badge variant={STATUS_VARIANT[expense.status]}>{STATUS_LABEL[expense.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {expense.amount} {expense.currencyCode}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
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
                            />
                          ) : null}
                          <ExpenseHistoryDialog groupId={groupId} expenseId={expense.id} />
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
        </CardContent>
      </Card>
    </div>
  );
}
