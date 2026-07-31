"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ────────────────────────────────────────────────

export type TrafficPoint = {
  date: string; // ISO date of bucket start (YYYY-MM-DD)
  label: string; // human label, e.g. "May 18"
  events: number;
  visitors: number;
  programViews: number;
  clicks: number;
  searches: number;
};

export type TrafficSeries = {
  day: TrafficPoint[];
  week: TrafficPoint[];
  month: TrafficPoint[];
};

type Granularity = keyof TrafficSeries;
type MetricKey = "visitors" | "events" | "programViews" | "clicks" | "searches";

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: "visitors", label: "Visitors", color: "#10b981" },
  { key: "events", label: "Events", color: "#3b82f6" },
  { key: "programViews", label: "Program Views", color: "#8b5cf6" },
  { key: "clicks", label: "Outbound Clicks", color: "#f59e0b" },
  { key: "searches", label: "Searches", color: "#06b6d4" },
];

const GRANULARITIES: { key: Granularity; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const BUCKET_NOUN: Record<Granularity, string> = {
  day: "day",
  week: "week",
  month: "month",
};

// ── Helpers ──────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

function delta(curr: number, prev: number): { text: string; up: boolean } {
  if (prev === 0) return { text: curr > 0 ? "+∞" : "—", up: curr >= 0 };
  const d = ((curr - prev) / prev) * 100;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(0)}%`, up: d >= 0 };
}

// ── Tooltip ──────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  color,
  metricLabel,
}: {
  active?: boolean;
  payload?: { payload: TrafficPoint }[];
  color: string;
  metricLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const value = payload[0] as unknown as { value: number };
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground">{p.label}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-muted-foreground">{metricLabel}</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          {fmt(value.value)}
        </span>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────

export default function TrafficChart({ series }: { series: TrafficSeries }) {
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [metricKey, setMetricKey] = useState<MetricKey>("visitors");

  const metric = METRICS.find((m) => m.key === metricKey)!;
  const data = series[granularity];

  // Period totals for every metric (drives the metric tab numbers + headline)
  const totals = useMemo(() => {
    const acc: Record<MetricKey, number> = {
      visitors: 0,
      events: 0,
      programViews: 0,
      clicks: 0,
      searches: 0,
    };
    for (const p of data) {
      acc.visitors += p.visitors;
      acc.events += p.events;
      acc.programViews += p.programViews;
      acc.clicks += p.clicks;
      acc.searches += p.searches;
    }
    return acc;
  }, [data]);

  // Headline delta: latest bucket vs previous bucket for the active metric
  const trend = useMemo(() => {
    if (data.length < 2) return null;
    const last = data[data.length - 1][metricKey];
    const prev = data[data.length - 2][metricKey];
    return delta(last, prev);
  }, [data, metricKey]);

  const headline = totals[metricKey];
  const noun = BUCKET_NOUN[granularity];

  return (
    <div className="rounded-xl border border-border/40 bg-card/20 p-5 mb-6">
      {/* Header: title + granularity toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">Traffic</h2>
          <span className="text-[10px] text-muted-foreground/50">
            last {data.length} {noun}
            {data.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex rounded-lg border border-border/50 bg-card/40 p-0.5">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              onClick={() => setGranularity(g.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                granularity === g.key
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric tabs (Stripe-style switchable KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        {METRICS.map((m) => {
          const active = m.key === metricKey;
          return (
            <button
              key={m.key}
              onClick={() => setMetricKey(m.key)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                active
                  ? "border-transparent bg-card/60"
                  : "border-border/30 bg-transparent hover:bg-card/30"
              }`}
              style={active ? { boxShadow: `inset 2px 0 0 0 ${m.color}` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: m.color, opacity: active ? 1 : 0.4 }}
                />
                <span
                  className={`text-[10px] uppercase tracking-wide ${
                    active ? "text-foreground" : "text-muted-foreground/60"
                  }`}
                >
                  {m.label}
                </span>
              </div>
              <div
                className={`mt-1 text-lg font-bold tabular-nums ${
                  active ? "" : "text-muted-foreground"
                }`}
              >
                {fmt(totals[m.key])}
              </div>
            </button>
          );
        })}
      </div>

      {/* Headline for the active metric */}
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-2xl font-bold tabular-nums" style={{ color: metric.color }}>
          {fmt(headline)}
        </span>
        <span className="text-xs text-muted-foreground">{metric.label} total</span>
        {trend && (
          <span
            className={`text-xs font-medium ${
              trend.up ? "text-emerald-500" : "text-red-400"
            }`}
          >
            {trend.text}{" "}
            <span className="text-muted-foreground/50">vs prev {noun}</span>
          </span>
        )}
      </div>

      {/* Area chart */}
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="currentColor"
              className="text-border/30"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-muted-foreground/50"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-muted-foreground/40"
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: metric.color, strokeOpacity: 0.3 }}
              content={<ChartTooltip color={metric.color} metricLabel={metric.label} />}
            />
            <Area
              type="monotone"
              dataKey={metricKey}
              stroke={metric.color}
              strokeWidth={2}
              fill={`url(#grad-${metricKey})`}
              dot={false}
              activeDot={{ r: 4, fill: metric.color }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
