"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SETTLEMENT_METHOD_LABEL, SETTLEMENT_PAYMENT_METHODS, type SettlementPaymentMethod } from "@/lib/settlements/methods";

export interface SettlementBalance {
  userId: string;
  alias: string;
  netCents: number;
  hasLeftGroup: boolean;
}

export interface SettlementTransaction {
  fromUserId: string;
  fromAlias: string;
  fromHasLeftGroup: boolean;
  toUserId: string;
  toAlias: string;
  toHasLeftGroup: boolean;
  amountCents: number;
}

export interface CurrencySettlement {
  currencyCode: string;
  balances: SettlementBalance[];
  transactions: SettlementTransaction[];
}

function toAmount(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

function AliasLink({ userId, alias, hasLeftGroup }: { userId: string; alias: string; hasLeftGroup: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/users/${userId}`} className="text-foreground underline-offset-4 hover:underline">
        {alias}
      </Link>
      {hasLeftGroup ? <Badge variant="outline">Ha abandonado el grupo</Badge> : null}
    </span>
  );
}

interface MarkPaidButtonProps {
  groupId: string;
  subgroupId?: string | undefined;
  currencyCode: string;
  transaction: SettlementTransaction;
  onPaid: () => Promise<void> | void;
}

/**
 * Boton + dialogo (Fase 9 ampliada) para registrar que una transaccion sugerida por
 * la liquidacion se ha efectuado realmente fuera de la app: pide el metodo
 * usado (efectivo, Bizum o transferencia) y, al confirmar, avisa al otro
 * implicado mediante una notificacion con el importe y el metodo (ver
 * `recordSettlementPayment`, `src/lib/settlements/service.ts`).
 */
function MarkPaidButton({ groupId, subgroupId, currencyCode, transaction, onPaid }: MarkPaidButtonProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<SettlementPaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/settlement/payments`, {
        method: "POST",
        body: JSON.stringify({
          subgroupId,
          fromUserId: transaction.fromUserId,
          toUserId: transaction.toUserId,
          amount: toAmount(transaction.amountCents),
          currencyCode,
          method,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo registrar el pago");
        return;
      }
      toast.success(`Pago registrado con ${SETTLEMENT_METHOD_LABEL[method]}`);
      setOpen(false);
      await onPaid();
    } catch {
      toast.error("Sin conexion: no se puede registrar el pago ahora");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Marcar como pagado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar pago</DialogTitle>
          <DialogDescription>
            <AliasLink userId={transaction.fromUserId} alias={transaction.fromAlias} hasLeftGroup={transaction.fromHasLeftGroup} />
            {" paga a "}
            <AliasLink userId={transaction.toUserId} alias={transaction.toAlias} hasLeftGroup={transaction.toHasLeftGroup} />
            {" "}
            <span className="font-medium text-foreground">
              {toAmount(transaction.amountCents)} {currencyCode}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settlement-payment-method">Metodo de pago</Label>
          <Select value={method} onValueChange={(value) => setMethod(value as SettlementPaymentMethod)}>
            <SelectTrigger id="settlement-payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SETTLEMENT_PAYMENT_METHODS.map((value) => (
                <SelectItem key={value} value={value}>
                  {SETTLEMENT_METHOD_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Guardando..." : "Confirmar pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Liquidacion de deudas (Fase 9): por cada moneda presente en el ambito
 * (grupo o subgrupo), muestra el balance neto de cada persona (a favor o
 * en contra) y el numero minimo de transacciones que liquidarian todas las
 * deudas (calculado en el servidor via `src/lib/settlements/optimize.ts`).
 *
 * Fase 10: si hay mas de una moneda, se muestra ademas `convertedOverall`
 * (liquidacion combinada tras convertir todo a la moneda base del grupo
 * con el cambio de referencia del BCE), destacada al principio.
 *
 * Fase 9 (ampliacion): cada transaccion sugerida (salvo las del resumen combinado, que
 * se recalculan automaticamente a partir de las monedas individuales) tiene
 * un boton "Marcar como pagado" (`MarkPaidButton`) para registrar que la
 * deuda ya se ha saldado fuera de la app con un metodo concreto (efectivo,
 * Bizum o transferencia); al confirmarlo se avisa al otro implicado y la
 * transaccion deja de aparecer como pendiente la siguiente vez que se
 * recalcule la liquidacion. Solo pueden marcarla como pagada los dos
 * implicados en la deuda o un administrador del grupo (`groupId`,
 * `currentUserId` e `isAdmin` deben pasarse para habilitar el boton;
 * sin `groupId` la tarjeta se queda en modo solo lectura, como antes).
 */
export function SettlementCard({
  settlements,
  convertedOverall,
  groupId,
  subgroupId,
  currentUserId,
  isAdmin = false,
  onPaid,
}: {
  settlements: CurrencySettlement[] | null;
  convertedOverall?: CurrencySettlement | null;
  groupId?: string | undefined;
  subgroupId?: string | undefined;
  currentUserId?: string | undefined;
  isAdmin?: boolean;
  onPaid?: (() => Promise<void> | void) | undefined;
}) {
  return (
    <CollapsibleCard
      title="Liquidacion"
      description="Balance de cada persona y el numero minimo de pagos necesarios para saldar las deudas."
    >
      {settlements === null ? (
        <Skeleton className="h-24 w-full" />
      ) : settlements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay deudas pendientes de liquidar.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {convertedOverall ? (
            <div className="flex flex-col gap-4 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Resumen combinado (convertido a {convertedOverall.currencyCode})
              </p>
              <SettlementDetail settlement={convertedOverall} allowMarkPaid={false} />
            </div>
          ) : null}
          {settlements.map((settlement) => (
            <div key={settlement.currencyCode} className="flex flex-col gap-4">
              <p className="text-xs font-medium text-muted-foreground">{settlement.currencyCode}</p>
              <SettlementDetail
                settlement={settlement}
                allowMarkPaid={Boolean(groupId)}
                groupId={groupId}
                subgroupId={subgroupId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onPaid={onPaid}
              />
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function SettlementDetail({
  settlement,
  allowMarkPaid,
  groupId,
  subgroupId,
  currentUserId,
  isAdmin = false,
  onPaid,
}: {
  settlement: CurrencySettlement;
  allowMarkPaid: boolean;
  groupId?: string | undefined;
  subgroupId?: string | undefined;
  currentUserId?: string | undefined;
  isAdmin?: boolean;
  onPaid?: (() => Promise<void> | void) | undefined;
}) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {settlement.balances.map((balance) => (
          <li key={balance.userId} className="flex items-center justify-between gap-2 text-sm">
            <AliasLink userId={balance.userId} alias={balance.alias} hasLeftGroup={balance.hasLeftGroup} />
            <Badge variant={balance.netCents > 0 ? "success" : "destructive"}>
              {balance.netCents > 0 ? `le deben ${toAmount(balance.netCents)}` : `debe ${toAmount(balance.netCents)}`}{" "}
              {settlement.currencyCode}
            </Badge>
          </li>
        ))}
      </ul>

      {settlement.transactions.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {settlement.transactions.length === 1
              ? "1 pago liquida todas las deudas"
              : `${settlement.transactions.length} pagos liquidan todas las deudas`}
          </p>
          <ul className="flex flex-col gap-2">
            {settlement.transactions.map((transaction, index) => {
              const canMarkPaid =
                allowMarkPaid &&
                groupId &&
                (isAdmin || currentUserId === transaction.fromUserId || currentUserId === transaction.toUserId);
              return (
                <li
                  key={`${transaction.fromUserId}-${transaction.toUserId}-${index}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <AliasLink
                    userId={transaction.fromUserId}
                    alias={transaction.fromAlias}
                    hasLeftGroup={transaction.fromHasLeftGroup}
                  />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <AliasLink userId={transaction.toUserId} alias={transaction.toAlias} hasLeftGroup={transaction.toHasLeftGroup} />
                  <span className="font-medium text-foreground">
                    {toAmount(transaction.amountCents)} {settlement.currencyCode}
                  </span>
                  {canMarkPaid ? (
                    <MarkPaidButton
                      groupId={groupId}
                      subgroupId={subgroupId}
                      currencyCode={settlement.currencyCode}
                      transaction={transaction}
                      onPaid={async () => {
                        await onPaid?.();
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
