"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ExpenseFormDialog } from "./expense-form-dialog";
import { ExpenseHistoryDialog } from "./expense-history-dialog";

interface GroupDetail {
  group: { id: string; name: string; inviteCode: string; maxMembers: number; maxSubgroups: number };
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

export default function GroupDetailClient({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [subgroups, setSubgroups] = useState<Subgroup[] | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[] | null>(null);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);

  const isAdmin = members?.find((m) => m.userId === currentUserId)?.role === "admin";

  const load = useCallback(async () => {
    const [detailRes, membersRes, subgroupsRes, expensesRes] = await Promise.all([
      apiFetch(`/api/groups/${groupId}`),
      apiFetch(`/api/groups/${groupId}/members`),
      apiFetch(`/api/groups/${groupId}/subgroups`),
      apiFetch(`/api/groups/${groupId}/expenses`),
    ]);
    if (detailRes.ok) setDetail(await detailRes.json());
    if (membersRes.ok) setMembers((await membersRes.json()).members);
    if (subgroupsRes.ok) setSubgroups((await subgroupsRes.json()).subgroups);
    if (expensesRes.ok) setExpenses((await expensesRes.json()).expenses);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

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

  if (!detail) {
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.group.name}</h1>
        <Badge variant="outline" className="font-mono text-sm">
          {detail.group.inviteCode}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {detail.memberCount} / {detail.group.maxMembers} miembros · {detail.subgroupCount} /{" "}
        {detail.group.maxSubgroups} subgrupos
      </p>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Gastos</CardTitle>
            <CardDescription>Historial de gastos del grupo, mas recientes primero.</CardDescription>
          </div>
          {members ? (
            <ExpenseFormDialog
              groupId={groupId}
              members={members.map((m) => ({ userId: m.userId, alias: m.alias }))}
              subgroups={subgroups ?? []}
              onSaved={load}
            />
          ) : null}
        </CardHeader>
        <CardContent>
          {expenses === null ? (
            <Skeleton className="h-24 w-full" />
          ) : expenses.length === 0 ? (
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
                {expenses.map(({ expense, payerAlias }) => {
                  const canEdit = isAdmin || expense.createdBy === currentUserId;
                  const canDelete = isAdmin || expense.createdBy === currentUserId;
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
                          {canEdit && members ? (
                            <ExpenseFormDialog
                              groupId={groupId}
                              members={members.map((m) => ({ userId: m.userId, alias: m.alias }))}
                              subgroups={subgroups ?? []}
                              onSaved={load}
                              editExpenseId={expense.id}
                            />
                          ) : null}
                          <ExpenseHistoryDialog groupId={groupId} expenseId={expense.id} />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Miembros</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subgrupos</CardTitle>
          <CardDescription>Cualquier miembro del grupo puede crear subgrupos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {subgroups && subgroups.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {subgroups.map((subgroup) => (
                <li key={subgroup.id}>
                  <Badge variant="outline">{subgroup.name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Todavia no hay subgrupos.</p>
          )}
        </CardContent>
        <form onSubmit={handleCreateSubgroup}>
          <CardContent className="flex flex-col gap-2 pt-0">
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
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
