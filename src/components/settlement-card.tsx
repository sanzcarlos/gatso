"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, ChevronDown, CircleCheck, HandCoins, Scale, WalletCards } from "lucide-react";
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

function formatMoney(cents: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currencyCode,
      currencyDisplay: "symbol",
    }).format(Math.abs(cents) / 100);
  } catch {
    return `${toAmount(cents)} ${currencyCode}`;
  }
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
        <Button type="button" size="sm" className="w-full sm:w-auto">
          <Check />
          Marcar pagado
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar como pagado</DialogTitle>
          <DialogDescription>Confirma que este pago ya se ha realizado fuera de Gatso.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/45 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="text-xs text-muted-foreground">De</p>
              <AliasLink userId={transaction.fromUserId} alias={transaction.fromAlias} hasLeftGroup={transaction.fromHasLeftGroup} />
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 text-right text-sm">
              <p className="text-xs text-muted-foreground">Para</p>
              <AliasLink userId={transaction.toUserId} alias={transaction.toAlias} hasLeftGroup={transaction.toHasLeftGroup} />
            </div>
          </div>
          <p className="mt-4 border-t border-border pt-3 text-center text-2xl font-bold tracking-tight text-foreground">
            {formatMoney(transaction.amountCents, currencyCode)}
          </p>
        </div>
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
          <Button type="button" onClick={handleConfirm} disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Guardando..." : "Sí, registrar pago"}
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
  const pendingPayments = settlements?.reduce((total, settlement) => total + settlement.transactions.length, 0) ?? 0;

  return (
    <CollapsibleCard
      title="Liquidación"
      description="Los pagos necesarios para dejar las cuentas a cero."
      headerExtra={
        settlements !== null && pendingPayments > 0 ? (
          <Badge variant="warning">{pendingPayments} {pendingPayments === 1 ? "pago" : "pagos"}</Badge>
        ) : null
      }
    >
      {settlements === null ? (
        <div className="flex flex-col gap-3" aria-label="Cargando liquidación">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : settlements.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-success/20 bg-success/5 px-4 py-8 text-center">
          <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
            <CircleCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="font-semibold text-foreground">Todo está saldado</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">No queda ningún pago pendiente en este grupo.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {convertedOverall ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Scale className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Vista unificada</p>
                  <p className="text-sm text-muted-foreground">
                    Equivalencia orientativa de todas las monedas en {convertedOverall.currencyCode}.
                  </p>
                </div>
              </div>
              <SettlementDetail settlement={convertedOverall} allowMarkPaid={false} isEstimate />
            </div>
          ) : null}
          {settlements.map((settlement) => (
            <section key={settlement.currencyCode} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <WalletCards className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-foreground">Pagos en {settlement.currencyCode}</h3>
                    <p className="text-xs text-muted-foreground">
                      {settlement.transactions.length === 1
                        ? "Solo falta 1 movimiento"
                        : `Faltan ${settlement.transactions.length} movimientos`}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">{settlement.currencyCode}</Badge>
              </div>
              <SettlementDetail
                settlement={settlement}
                allowMarkPaid={Boolean(groupId)}
                groupId={groupId}
                subgroupId={subgroupId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onPaid={onPaid}
              />
            </section>
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
  isEstimate = false,
}: {
  settlement: CurrencySettlement;
  allowMarkPaid: boolean;
  groupId?: string | undefined;
  subgroupId?: string | undefined;
  currentUserId?: string | undefined;
  isAdmin?: boolean;
  onPaid?: (() => Promise<void> | void) | undefined;
  isEstimate?: boolean;
}) {
  const creditorCount = settlement.balances.filter((balance) => balance.netCents > 0).length;
  const debtorCount = settlement.balances.filter((balance) => balance.netCents < 0).length;

  return (
    <div className={isEstimate ? "flex flex-col gap-4" : "flex flex-col gap-4 p-4 sm:p-5"}>
      {settlement.transactions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">{isEstimate ? "Así quedarían las cuentas" : "Qué pagos hay que hacer"}</p>
          </div>
          <ol className="flex flex-col gap-3">
            {settlement.transactions.map((transaction, index) => {
              const canMarkPaid =
                allowMarkPaid &&
                groupId &&
                (isAdmin || currentUserId === transaction.fromUserId || currentUserId === transaction.toUserId);
              return (
                <li
                  key={`${transaction.fromUserId}-${transaction.toUserId}-${index}`}
                  className="rounded-xl border border-border bg-background/65 p-4"
                >
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                      <div className="min-w-0 text-sm">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Paga</p>
                        <AliasLink
                          userId={transaction.fromUserId}
                          alias={transaction.fromAlias}
                          hasLeftGroup={transaction.fromHasLeftGroup}
                        />
                      </div>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 text-right text-sm">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recibe</p>
                        <AliasLink userId={transaction.toUserId} alias={transaction.toAlias} hasLeftGroup={transaction.toHasLeftGroup} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:min-w-36 sm:items-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
                      <span className="text-xl font-bold tracking-tight text-foreground">
                        {formatMoney(transaction.amountCents, settlement.currencyCode)}
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
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      <details className="group rounded-xl bg-muted/45 px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Ver balance por persona
            <span className="font-normal text-muted-foreground">({creditorCount} a favor · {debtorCount} deben)</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border pt-1">
          {settlement.balances.map((balance) => (
            <li key={balance.userId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <AliasLink userId={balance.userId} alias={balance.alias} hasLeftGroup={balance.hasLeftGroup} />
              <span className={balance.netCents > 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
                {balance.netCents > 0 ? "+" : "−"}{formatMoney(balance.netCents, settlement.currencyCode)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
