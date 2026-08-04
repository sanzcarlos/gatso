"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { queuePendingExpense } from "@/lib/offline/sync";
import { AMOUNT_REGEX } from "@/lib/validation/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";

interface Member {
  userId: string;
  displayName: string;
  /** Fase 8: true si ya no es miembro actual del grupo (dato historico). */
  hasLeftGroup?: boolean;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface Subgroup {
  id: string;
  name: string;
}

type SplitMethod = "equal" | "percentage" | "fixed";

interface ParticipantRow {
  included: boolean;
  value: string;
}

export function ExpenseFormDialog({
  groupId,
  members,
  subgroups,
  onSaved,
  editExpenseId,
  lockedSubgroupId,
  groupBaseCurrencyCode,
}: {
  groupId: string;
  members: Member[];
  subgroups: Subgroup[];
  onSaved: () => void | Promise<void>;
  /** Si se indica, el dialogo edita ese gasto en vez de crear uno nuevo. */
  editExpenseId?: string;
  /** Si se indica, el gasto queda fijado a este subgrupo y se oculta el selector. */
  lockedSubgroupId?: string;
  /** Moneda base del grupo (Fase 10): si se indica, se muestra una previsualizacion "≈ X BASECUR" cuando la moneda del gasto es distinta. */
  groupBaseCurrencyCode?: string | undefined;
}) {
  const isEditMode = Boolean(editExpenseId);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("EUR");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payerId, setPayerId] = useState<string>(members[0]?.userId ?? "");
  const [subgroupId, setSubgroupId] = useState<string>(lockedSubgroupId ?? "none");
  const [method, setMethod] = useState<SplitMethod>("equal");
  const [rows, setRows] = useState<Record<string, ParticipantRow>>({});
  /**
   * Fase 8: al editar, puede incluir participantes/pagador que ya
   * abandonaron el grupo (grandfathered en `updateExpense`); `members`
   * (prop) solo trae miembros actuales, asi que se amplia localmente para
   * no perder su fila del formulario ni romper el selector de pagador.
   */
  const [effectiveMembers, setEffectiveMembers] = useState<Member[]>(members);
  const [convertedPreview, setConvertedPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/currencies")
      .then((r) => (r.ok ? r.json() : { currencies: [] }))
      .then((data) => setCurrencies(data.currencies ?? []));
  }, [open]);

  useEffect(() => {
    if (!open || !groupBaseCurrencyCode || currencyCode === groupBaseCurrencyCode || !AMOUNT_REGEX.test(amount.trim())) {
      setConvertedPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      apiFetch(`/api/groups/${groupId}/expenses/convert-preview?amount=${encodeURIComponent(amount)}&currencyCode=${currencyCode}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setConvertedPreview(data?.convertedAmount ?? null))
        .catch(() => setConvertedPreview(null));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, amount, currencyCode, groupBaseCurrencyCode, groupId]);

  useEffect(() => {
    if (!open || !isEditMode || !editExpenseId) return;
    setLoadingDetail(true);
    apiFetch(`/api/groups/${groupId}/expenses/${editExpenseId}`)
      .then(async (response) => {
        if (!response.ok) {
          toast.error("No se pudo cargar el gasto");
          setOpen(false);
          return;
        }
        const data = await response.json();
        const expense = data.expense as {
          amount: string;
          currencyCode: string;
          description: string;
          notes: string | null;
          expenseDate: string;
          payerId: string;
          subgroupId: string | null;
          splitMethod: SplitMethod;
        };
        const payerDisplayName = data.payerDisplayName as string;
        const shares = data.shares as {
          userId: string;
          displayName: string;
          shareAmount: string;
          sharePercentage: string | null;
          hasLeftGroup: boolean;
        }[];

        setAmount(expense.amount);
        setCurrencyCode(expense.currencyCode);
        setDescription(expense.description);
        setNotes(expense.notes ?? "");
        setExpenseDate(expense.expenseDate);
        setPayerId(expense.payerId);
        setSubgroupId(lockedSubgroupId ?? expense.subgroupId ?? "none");
        setMethod(expense.splitMethod);

        const knownUserIds = new Set(members.map((m) => m.userId));
        const formerMembers: Member[] = [];
        if (!knownUserIds.has(expense.payerId)) {
          formerMembers.push({ userId: expense.payerId, displayName: payerDisplayName, hasLeftGroup: true });
          knownUserIds.add(expense.payerId);
        }
        for (const share of shares) {
          if (!knownUserIds.has(share.userId)) {
            formerMembers.push({ userId: share.userId, displayName: share.displayName, hasLeftGroup: true });
            knownUserIds.add(share.userId);
          }
        }
        const allMembers = [...members, ...formerMembers];
        setEffectiveMembers(allMembers);

        const nextRows: Record<string, ParticipantRow> = {};
        for (const member of allMembers) {
          const share = shares.find((s) => s.userId === member.userId);
          nextRows[member.userId] = share
            ? {
                included: true,
                value: expense.splitMethod === "percentage" ? (share.sharePercentage ?? "") : share.shareAmount,
              }
            : { included: false, value: "" };
        }
        setRows(nextRows);
      })
      .catch(() => {
        toast.error("No se pudo cargar el gasto (sin conexion)");
        setOpen(false);
      })
      .finally(() => setLoadingDetail(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditMode, editExpenseId, groupId]);

  useEffect(() => {
    if (isEditMode) return;
    setEffectiveMembers(members);
    setRows((prev) => {
      const next: Record<string, ParticipantRow> = {};
      for (const member of members) {
        next[member.userId] = prev[member.userId] ?? { included: true, value: "" };
      }
      return next;
    });
  }, [members, isEditMode]);

  const totalIncluded = useMemo(
    () => Object.values(rows).filter((r) => r.included).length,
    [rows],
  );

  function toggleIncluded(userId: string) {
    setRows((prev) => {
      const current = prev[userId] ?? { included: true, value: "" };
      return { ...prev, [userId]: { ...current, included: !current.included } };
    });
  }

  function setValue(userId: string, value: string) {
    setRows((prev) => {
      const current = prev[userId] ?? { included: true, value: "" };
      return { ...prev, [userId]: { ...current, included: true, value } };
    });
  }

  function resetForm() {
    setAmount("");
    setDescription("");
    setNotes("");
    setMethod("equal");
    setSubgroupId("none");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const included = Object.entries(rows).filter(([, row]) => row.included);
    if (included.length === 0) {
      toast.error("Selecciona al menos un participante");
      return;
    }

    let split;
    if (method === "equal") {
      split = { method: "equal" as const, participantUserIds: included.map(([userId]) => userId) };
    } else if (method === "percentage") {
      split = {
        method: "percentage" as const,
        shares: included.map(([userId, row]) => ({ userId, percentage: row.value || "0" })),
      };
    } else {
      split = {
        method: "fixed" as const,
        shares: included.map(([userId, row]) => ({ userId, amount: row.value || "0" })),
      };
    }

    const effectiveSubgroupId = lockedSubgroupId ?? (subgroupId === "none" ? undefined : subgroupId);
    const payload = {
      amount,
      currencyCode,
      description,
      notes: notes.trim() || undefined,
      expenseDate,
      payerId,
      subgroupId: effectiveSubgroupId,
      split,
    };

    setSubmitting(true);
    try {
      if (isEditMode) {
        const response = await apiFetch(`/api/groups/${groupId}/expenses/${editExpenseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          toast.error(data.error ?? "No se pudo editar el gasto");
          return;
        }
        toast.success("Gasto actualizado");
        setOpen(false);
        await onSaved();
        return;
      }

      try {
        const response = await apiFetch(`/api/groups/${groupId}/expenses`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          toast.error(data.error ?? "No se pudo crear el gasto");
          return;
        }
        toast.success("Gasto creado");
      } catch {
        await queuePendingExpense(groupId, payload);
        toast.info("Sin conexion: el gasto se ha guardado en este dispositivo y se sincronizara cuando vuelvas a tener conexion.");
      }
      resetForm();
      setOpen(false);
      await onSaved();
    } catch {
      toast.error(isEditMode ? "No se pudo editar el gasto: sin conexion" : "No se pudo crear el gasto");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditMode ? (
          <Button variant="ghost" size="sm" aria-label="Editar gasto">
            <Pencil />
            Editar
          </Button>
        ) : (
          <Button>
            <Plus />
            Nuevo gasto
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Si editas un gasto de otro usuario (como administrador), quedara pendiente de validacion por quien lo creo."
              : "Registra quien pago y como se reparte entre el grupo."}
          </DialogDescription>
        </DialogHeader>
        {loadingDetail ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-amount">Importe</Label>
                <Input
                  id="expense-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="42.50"
                  required
                />
                {convertedPreview ? (
                  <p className="text-xs text-muted-foreground">
                    ≈ {convertedPreview} {groupBaseCurrencyCode} (cambio de referencia del BCE)
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-currency">Moneda</Label>
                <Select value={currencyCode} onValueChange={setCurrencyCode}>
                  <SelectTrigger id="expense-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(currencies.length > 0 ? currencies : [{ code: "EUR", name: "Euro", symbol: "€" }]).map(
                      (currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code} ({currency.symbol})
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-description">Descripcion</Label>
              <Input
                id="expense-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cena del sabado"
                maxLength={280}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-notes">Comentario (opcional)</Label>
              <Textarea
                id="expense-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas adicionales sobre este gasto"
                maxLength={2000}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-date">Fecha</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-payer">Pagador</Label>
                <Select value={payerId} onValueChange={setPayerId}>
                  <SelectTrigger id="expense-payer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {effectiveMembers.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.displayName}
                        {member.hasLeftGroup ? " (ha abandonado el grupo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!lockedSubgroupId && subgroups.length > 0 ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-subgroup">Subgrupo (opcional)</Label>
                <Select value={subgroupId} onValueChange={setSubgroupId}>
                  <SelectTrigger id="expense-subgroup">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todo el grupo</SelectItem>
                    {subgroups.map((subgroup) => (
                      <SelectItem key={subgroup.id} value={subgroup.id}>
                        {subgroup.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="expense-method">Metodo de reparto</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as SplitMethod)}>
                <SelectTrigger id="expense-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">Partes iguales</SelectItem>
                  <SelectItem value="percentage">Por porcentajes</SelectItem>
                  <SelectItem value="fixed">Por importes fijos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Participantes {method !== "equal" ? `(deben sumar ${method === "percentage" ? "100%" : "el importe total"})` : `(${totalIncluded} seleccionados)`}
              </p>
              {effectiveMembers.map((member) => {
                const row = rows[member.userId] ?? { included: true, value: "" };
                return (
                  <div key={member.userId} className="flex items-center gap-3">
                    <Switch
                      checked={row.included}
                      onCheckedChange={() => toggleIncluded(member.userId)}
                      aria-label={`Incluir a ${member.displayName}`}
                    />
                    <span className="flex-1 text-sm text-foreground">
                      {member.displayName}
                      {member.hasLeftGroup ? (
                        <span className="ml-2 text-xs text-muted-foreground">(ha abandonado el grupo)</span>
                      ) : null}
                    </span>
                    {method !== "equal" && row.included ? (
                      <Input
                        className="w-24"
                        value={row.value}
                        onChange={(e) => setValue(member.userId, e.target.value)}
                        placeholder={method === "percentage" ? "33.33" : "10.00"}
                        required
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Guardando..." : isEditMode ? "Guardar cambios" : "Crear gasto"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
