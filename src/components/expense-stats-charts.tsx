"use client";

import { ChartNoAxesCombined, CircleDollarSign, UsersRound } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface MemberAmount {
  userId: string;
  displayName: string;
  totalCents: number;
}

export interface CurrencyExpenseStats {
  currencyCode: string;
  totalCents: number;
  paidByMember: MemberAmount[];
  shareByMember: MemberAmount[];
  convertedTotalCents?: number | null;
}

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-destructive)",
  "var(--color-muted-foreground)",
];

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  boxShadow: "var(--shadow-md)",
  color: "var(--color-popover-foreground)",
};
const TOOLTIP_LABEL_STYLE = { color: "var(--color-popover-foreground)", fontWeight: 600 };
const TOOLTIP_ITEM_STYLE = { color: "var(--color-popover-foreground)" };

function colorFor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] ?? "var(--color-primary)";
}

function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function chartHeight(itemCount: number): number {
  return Math.max(220, itemCount * 46 + 48);
}

/** Graficas de gastos por moneda para grupos y subgrupos. */
export function ExpenseStatsCharts({
  stats,
  loading,
  baseCurrencyCode,
  totalConvertedCents,
}: {
  stats: CurrencyExpenseStats[] | null;
  loading?: boolean;
  baseCurrencyCode?: string | undefined;
  totalConvertedCents?: number | null | undefined;
}) {
  if (loading || stats === null) {
    return (
      <div className="space-y-4" aria-label="Cargando analisis de gastos">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          <ChartNoAxesCombined className="h-6 w-6" />
        </span>
        <p className="mt-4 font-semibold text-foreground">Aun no hay datos que analizar</p>
        <p className="mt-1 text-sm text-muted-foreground">Las graficas apareceran cuando se registre el primer gasto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {stats.length > 1 && baseCurrencyCode && totalConvertedCents !== undefined && totalConvertedCents !== null ? (
        <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.07] p-5">
          <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CircleDollarSign className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Vision consolidada</p>
              <p className="mt-1 text-sm text-muted-foreground">Total de todas las monedas convertido a {baseCurrencyCode}</p>
            </div>
            <p className="shrink-0 text-xl font-bold tabular-nums tracking-tight sm:text-2xl">
              {formatCents(totalConvertedCents, baseCurrencyCode)}
            </p>
          </div>
        </section>
      ) : null}

      {stats.map((currencyStats) => (
        <CurrencyCharts key={currencyStats.currencyCode} stats={currencyStats} />
      ))}
    </div>
  );
}

function CurrencyCharts({ stats }: { stats: CurrencyExpenseStats }) {
  const members = new Map<string, number>();
  [...stats.paidByMember, ...stats.shareByMember].forEach((member) => {
    if (!members.has(member.userId)) members.set(member.userId, members.size);
  });

  const paidData = stats.paidByMember.map((member) => ({
    ...member,
    amount: member.totalCents / 100,
    fill: colorFor(members.get(member.userId) ?? 0),
  }));
  const shareData = stats.shareByMember
    .filter((member) => member.totalCents > 0)
    .map((member) => ({
      ...member,
      amount: member.totalCents / 100,
      fill: colorFor(members.get(member.userId) ?? 0),
      percentage: stats.totalCents > 0 ? (member.totalCents / stats.totalCents) * 100 : 0,
    }));

  return (
    <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-muted/25 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold tracking-wide text-primary">
              {stats.currencyCode}
            </span>
            <h3 className="font-semibold tracking-tight">Desglose de gastos</h3>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersRound className="h-3.5 w-3.5" />
            {members.size} {members.size === 1 ? "participante" : "participantes"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">Total registrado</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">
            {formatCents(stats.totalCents, stats.currencyCode)}
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <figure className="min-w-0 border-b border-border/70 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4">
            <h4 className="text-sm font-semibold">Pagado por persona</h4>
            <p className="mt-1 text-xs text-muted-foreground">Importe que ha adelantado cada participante.</p>
          </div>
          <div role="img" aria-label={`Grafica de importes pagados en ${stats.currencyCode}`}>
            <ResponsiveContainer width="100%" height={chartHeight(paidData.length)}>
              <BarChart data={paidData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid horizontal={false} stroke="var(--color-border)" strokeDasharray="3 5" />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
                  tickFormatter={formatCompact}
                />
                <YAxis
                  type="category"
                  dataKey="displayName"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-foreground)", fontSize: 12, fontWeight: 500 }}
                  width={88}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.55 }}
                  formatter={(value) => [formatCents(Number(value) * 100, stats.currencyCode), "Pagado"]}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Bar dataKey="amount" radius={[0, 7, 7, 0]} barSize={18}>
                  {paidData.map((member) => <Cell key={member.userId} fill={member.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <figcaption className="sr-only">Comparativa del importe pagado por cada persona.</figcaption>
        </figure>

        <ShareChart stats={stats} shareData={shareData} />
      </div>
    </section>
  );
}

function ShareChart({
  stats,
  shareData,
}: {
  stats: CurrencyExpenseStats;
  shareData: Array<MemberAmount & { amount: number; fill: string; percentage: number }>;
}) {
  return (
    <figure className="min-w-0 p-5">
      <div className="mb-2">
        <h4 className="text-sm font-semibold">Reparto final</h4>
        <p className="mt-1 text-xs text-muted-foreground">Proporcion del gasto que corresponde a cada persona.</p>
      </div>
      <div role="img" aria-label={`Grafica del reparto final en ${stats.currencyCode}`}>
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie
              data={shareData}
              dataKey="amount"
              nameKey="displayName"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={shareData.length > 1 ? 2 : 0}
              cornerRadius={5}
              stroke="var(--color-card)"
              strokeWidth={2}
            >
              {shareData.map((member) => <Cell key={member.userId} fill={member.fill} />)}
            </Pie>
            <Tooltip
              formatter={(value) => [formatCents(Number(value) * 100, stats.currencyCode), "Reparto"]}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <text x="50%" y="47%" textAnchor="middle" fill="var(--color-muted-foreground)" fontSize="11">
              TOTAL
            </text>
            <text x="50%" y="57%" textAnchor="middle" fill="var(--color-foreground)" fontSize="15" fontWeight="700">
              {formatCompact(stats.totalCents / 100)}
            </text>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Distribucion porcentual del gasto entre participantes.</figcaption>

      <div className="mt-1 space-y-2.5" aria-label="Detalle del reparto">
        {shareData.map((member) => (
          <div key={member.userId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.fill }} aria-hidden="true" />
            <span className="truncate font-medium" title={member.displayName}>{member.displayName}</span>
            <span className="text-right">
              <span className="font-semibold tabular-nums">{formatCents(member.totalCents, stats.currencyCode)}</span>
              <span className="ml-2 inline-block min-w-10 text-xs tabular-nums text-muted-foreground">
                {member.percentage.toFixed(0)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
