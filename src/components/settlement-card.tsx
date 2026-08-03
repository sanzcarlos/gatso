"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleCard } from "@/components/ui/collapsible-card";

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

/**
 * Liquidacion de deudas (Fase 9): por cada moneda presente en el ambito
 * (grupo o subgrupo), muestra el balance neto de cada persona (a favor o
 * en contra) y el numero minimo de transacciones que liquidarian todas las
 * deudas (calculado en el servidor via `src/lib/settlements/optimize.ts`).
 * Es una vista puramente informativa: no registra que una transaccion se
 * haya realizado realmente (ver limitaciones documentadas en PROGRESS.md).
 *
 * Fase 10: si hay mas de una moneda, se muestra ademas `convertedOverall`
 * (liquidacion combinada tras convertir todo a la moneda base del grupo
 * con el cambio de referencia del BCE), destacada al principio.
 */
export function SettlementCard({
  settlements,
  convertedOverall,
}: {
  settlements: CurrencySettlement[] | null;
  convertedOverall?: CurrencySettlement | null;
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
              <SettlementDetail settlement={convertedOverall} />
            </div>
          ) : null}
          {settlements.map((settlement) => (
            <div key={settlement.currencyCode} className="flex flex-col gap-4">
              <p className="text-xs font-medium text-muted-foreground">{settlement.currencyCode}</p>
              <SettlementDetail settlement={settlement} />
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}

function SettlementDetail({ settlement }: { settlement: CurrencySettlement }) {
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
            {settlement.transactions.map((transaction, index) => (
              <li
                key={`${transaction.fromUserId}-${transaction.toUserId}-${index}`}
                className="flex items-center gap-2 text-sm"
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
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
