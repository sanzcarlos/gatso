"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface MemberAmount {
  userId: string;
  alias: string;
  totalCents: number;
}

export interface CurrencyExpenseStats {
  currencyCode: string;
  totalCents: number;
  paidByMember: MemberAmount[];
  shareByMember: MemberAmount[];
}

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-secondary)",
  "var(--color-destructive)",
];

function colorFor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? "var(--color-primary)";
}

function toAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Graficas de gastos: cuanto ha pagado cada miembro y como se reparte el
 * total entre todos. Se muestra una pareja de graficas por cada moneda
 * presente en el ambito (grupo o subgrupo), ya que sumar importes de
 * monedas distintas sin conversion no tendria sentido.
 */
export function ExpenseStatsCharts({
  stats,
  loading,
}: {
  stats: CurrencyExpenseStats[] | null;
  loading?: boolean;
}) {
  if (loading || stats === null) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (stats.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavia no hay gastos para mostrar graficas.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {stats.map((currencyStats) => (
        <div key={currencyStats.currencyCode} className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pagado por miembro ({currencyStats.currencyCode})</CardTitle>
              <CardDescription>Cuanto ha adelantado cada persona.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={currencyStats.paidByMember.map((m) => ({ ...m, amount: Number(toAmount(m.totalCents)) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="alias" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(2)} ${currencyStats.currencyCode}`, "Pagado"]}
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-popover-foreground)",
                    }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {currencyStats.paidByMember.map((m, index) => (
                      <Cell key={m.userId} fill={colorFor(index)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reparto por miembro ({currencyStats.currencyCode})</CardTitle>
              <CardDescription>Cuanto le corresponde pagar a cada persona en total.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                  <Pie
                    data={currencyStats.shareByMember.map((m) => ({ ...m, amount: Number(toAmount(m.totalCents)) }))}
                    dataKey="amount"
                    nameKey="alias"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={(props: unknown) => {
                      const { percent } = props as { percent: number };
                      return `${(percent * 100).toFixed(0)}%`;
                    }}
                  >
                    {currencyStats.shareByMember.map((m, index) => (
                      <Cell key={m.userId} fill={colorFor(index)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(2)} ${currencyStats.currencyCode}`, "Reparto"]}
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      color: "var(--color-popover-foreground)",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 12, overflowWrap: "anywhere", wordBreak: "break-word" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
