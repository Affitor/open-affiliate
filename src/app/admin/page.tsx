import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { programs } from "@/lib/programs";

export const metadata = { title: "Command Center", robots: "noindex" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Helpers ──────────────────────────────────────────────

function ago(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return (a / b * 100).toFixed(1) + "%";
}

function delta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+∞" : "0%";
  const d = ((current - previous) / previous * 100).toFixed(0);
  return Number(d) >= 0 ? `+${d}%` : `${d}%`;
}

function deltaClass(current: number, previous: number): string {
  if (current >= previous) return "text-emerald-500";
  return "text-red-400";
}

function barWidth(value: number, max: number): string {
  if (max === 0) return "0%";
  return Math.max(2, value / max * 100).toFixed(1) + "%";
}

const FLAG: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵", IN: "🇮🇳", BR: "🇧🇷",
  CA: "🇨🇦", AU: "🇦🇺", VN: "🇻🇳", KR: "🇰🇷", SG: "🇸🇬", NL: "🇳🇱", SE: "🇸🇪",
  ID: "🇮🇩", TH: "🇹🇭", PH: "🇵🇭", MX: "🇲🇽", ES: "🇪🇸", IT: "🇮🇹", PL: "🇵🇱",
  TR: "🇹🇷", RU: "🇷🇺", CN: "🇨🇳", TW: "🇹🇼", HK: "🇭🇰", MY: "🇲🇾", NG: "🇳🇬",
  ZA: "🇿🇦", AE: "🇦🇪", SA: "🇸🇦", EG: "🇪🇬", AR: "🇦🇷", CL: "🇨🇱", CO: "🇨🇴",
  PK: "🇵🇰", BD: "🇧🇩", UA: "🇺🇦", RO: "🇷🇴", CZ: "🇨🇿", IL: "🇮🇱", IE: "🇮🇪",
  CH: "🇨🇭", AT: "🇦🇹", DK: "🇩🇰", FI: "🇫🇮", NO: "🇳🇴", NZ: "🇳🇿", PT: "🇵🇹",
  BE: "🇧🇪", GR: "🇬🇷", HU: "🇭🇺",
};

// ── Data fetching ────────────────────────────────────────

async function getEvents(since: string) {
  const { data } = await supabase
    .from("events")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10000);
  return data ?? [];
}

async function getRecentFeed() {
  const { data } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

async function getVoteCount() {
  const { count } = await supabase
    .from("votes")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

// ── Page ────────────────────────────────────────────────

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  await connection();
  const { key } = await searchParams;
  if (key !== process.env.ADMIN_SECRET) {
    notFound();
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString();
  const d60 = new Date(now.getTime() - 60 * 86400000).toISOString();

  const [events60d, feed, totalVotes] = await Promise.all([
    getEvents(d60),
    getRecentFeed(),
    getVoteCount(),
  ]);

  // Split into periods
  const events30d = events60d.filter((e) => e.created_at >= d30);
  const eventsPrev30d = events60d.filter((e) => e.created_at < d30);
  const events7d = events30d.filter((e) => e.created_at >= d7);
  const eventsToday = events30d.filter((e) => e.created_at >= today);

  // ── KPIs ──
  const uniqueVisitors = (events: typeof events30d) => new Set(events.map((e) => e.ip_hash)).size;
  const countType = (events: typeof events30d, type: string) => events.filter((e) => e.type === type).length;

  const kpis = {
    visits: { today: eventsToday.length, d7: events7d.length, d30: events30d.length, prev30: eventsPrev30d.length },
    uniques: { today: uniqueVisitors(eventsToday), d7: uniqueVisitors(events7d), d30: uniqueVisitors(events30d), prev30: uniqueVisitors(eventsPrev30d) },
    searches: { today: countType(eventsToday, "search"), d7: countType(events7d, "search"), d30: countType(events30d, "search"), prev30: countType(eventsPrev30d, "search") },
    clicks: { today: countType(eventsToday, "outbound_click"), d7: countType(events7d, "outbound_click"), d30: countType(events30d, "outbound_click"), prev30: countType(eventsPrev30d, "outbound_click") },
    programViews: { d30: countType(events30d, "program_view") },
  };

  // ── Funnel ──
  const funnelVisits = kpis.visits.d30;
  const funnelViews = kpis.programViews.d30;
  const funnelClicks = kpis.clicks.d30;

  // ── Daily chart (last 30 days) ──
  const dailyMap = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const e of events30d) {
    const day = e.created_at.slice(0, 10);
    if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const dailyData = Array.from(dailyMap.entries());
  const dailyMax = Math.max(...dailyData.map(([, v]) => v), 1);

  // ── Top Programs ──
  const programViewMap = new Map<string, { views: number; clicks: number }>();
  for (const e of events30d) {
    if (e.type === "program_view" && e.slug) {
      const entry = programViewMap.get(e.slug) ?? { views: 0, clicks: 0 };
      entry.views++;
      programViewMap.set(e.slug, entry);
    }
    if (e.type === "outbound_click" && e.slug) {
      const entry = programViewMap.get(e.slug) ?? { views: 0, clicks: 0 };
      entry.clicks++;
      programViewMap.set(e.slug, entry);
    }
  }
  const topPrograms = Array.from(programViewMap.entries())
    .map(([slug, stats]) => ({
      slug,
      name: programs.find((p) => p.slug === slug)?.name ?? slug,
      ...stats,
      ctr: stats.views > 0 ? stats.clicks / stats.views : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.views - a.views)
    .slice(0, 15);
  const topProgramMax = topPrograms[0]?.clicks ?? 1;

  // ── Search Intelligence ──
  const searchMap = new Map<string, number>();
  const zeroResults: string[] = [];
  for (const e of events30d) {
    if (e.type !== "search") continue;
    const q = (e.metadata?.query as string)?.toLowerCase()?.trim();
    if (!q) continue;
    searchMap.set(q, (searchMap.get(q) ?? 0) + 1);
    if (e.metadata?.resultCount === 0) zeroResults.push(q);
  }
  const topSearches = Array.from(searchMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const topSearchMax = topSearches[0]?.[1] ?? 1;
  const uniqueZeroResults = [...new Set(zeroResults)].slice(0, 10);

  // ── Countries ──
  const countryMap = new Map<string, number>();
  for (const e of events30d) {
    if (e.country) countryMap.set(e.country, (countryMap.get(e.country) ?? 0) + 1);
  }
  const topCountries = Array.from(countryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  const topCountryMax = topCountries[0]?.[1] ?? 1;

  // ── Referrers ──
  const refMap = new Map<string, number>();
  for (const e of events30d) {
    if (!e.referrer) continue;
    try {
      const host = new URL(e.referrer).hostname.replace("www.", "");
      if (host.includes("openaffiliate")) continue;
      refMap.set(host, (refMap.get(host) ?? 0) + 1);
    } catch {}
  }
  const topReferrers = Array.from(refMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topRefMax = topReferrers[0]?.[1] ?? 1;

  // ── Device ──
  const mobileCount = events30d.filter((e) => e.device === "mobile").length;
  const desktopCount = events30d.filter((e) => e.device === "desktop").length;

  // ── Top Pages ──
  const pageMap = new Map<string, number>();
  for (const e of events30d) {
    if (e.path) pageMap.set(e.path, (pageMap.get(e.path) ?? 0) + 1);
  }
  const topPages = Array.from(pageMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topPageMax = topPages[0]?.[1] ?? 1;

  // ── Categories by interest ──
  const catInterest = new Map<string, number>();
  for (const e of events30d) {
    if (e.type === "filter" && e.metadata?.filter === "category" && e.metadata?.value) {
      const cat = e.metadata.value as string;
      catInterest.set(cat, (catInterest.get(cat) ?? 0) + 1);
    }
    if (e.type === "category_view" && e.metadata?.category) {
      const cat = e.metadata.category as string;
      catInterest.set(cat, (catInterest.get(cat) ?? 0) + 1);
    }
  }
  const topCategories = Array.from(catInterest.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topCatMax = topCategories[0]?.[1] ?? 1;

  // ── UTM Campaigns ──
  const utmMap = new Map<string, number>();
  for (const e of events30d) {
    const utm = e.metadata?.utm as Record<string, string> | undefined;
    if (!utm?.utm_source) continue;
    const key = utm.utm_campaign
      ? `${utm.utm_source} / ${utm.utm_campaign}`
      : utm.utm_source;
    utmMap.set(key, (utmMap.get(key) ?? 0) + 1);
  }
  const topUtm = Array.from(utmMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // ── Sessions depth ──
  const sessionMap = new Map<string, number>();
  for (const e of events30d) {
    if (e.session_id) sessionMap.set(e.session_id, (sessionMap.get(e.session_id) ?? 0) + 1);
  }
  const sessionDepths = Array.from(sessionMap.values());
  const avgSessionDepth = sessionDepths.length > 0
    ? (sessionDepths.reduce((a, b) => a + b, 0) / sessionDepths.length).toFixed(1)
    : "0";
  const deepSessions = sessionDepths.filter((d) => d >= 5).length;

  const adminKey = `?key=${key}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-sm text-muted-foreground mt-1">
              OpenAffiliate — {programs.length} programs in registry
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{totalVotes} total votes</span>
            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <KpiCard
            label="Total Events"
            today={kpis.visits.today}
            d7={kpis.visits.d7}
            d30={kpis.visits.d30}
            prev30={kpis.visits.prev30}
          />
          <KpiCard
            label="Unique Visitors"
            today={kpis.uniques.today}
            d7={kpis.uniques.d7}
            d30={kpis.uniques.d30}
            prev30={kpis.uniques.prev30}
          />
          <KpiCard
            label="Searches"
            today={kpis.searches.today}
            d7={kpis.searches.d7}
            d30={kpis.searches.d30}
            prev30={kpis.searches.prev30}
          />
          <KpiCard
            label="Outbound Clicks"
            today={kpis.clicks.today}
            d7={kpis.clicks.d7}
            d30={kpis.clicks.d30}
            prev30={kpis.clicks.prev30}
            highlight
          />
        </div>

        {/* ── Funnel ── */}
        <Section title="Conversion Funnel" subtitle="30 days">
          <div className="flex items-end gap-2 h-32">
            <FunnelBar label="Visits" value={funnelVisits} max={funnelVisits} />
            <FunnelArrow rate={pct(funnelViews, funnelVisits)} />
            <FunnelBar label="Program Views" value={funnelViews} max={funnelVisits} />
            <FunnelArrow rate={pct(funnelClicks, funnelViews)} />
            <FunnelBar label="Outbound Clicks" value={funnelClicks} max={funnelVisits} accent />
          </div>
        </Section>

        {/* ── Daily Chart ── */}
        <Section title="Daily Activity" subtitle="Last 30 days">
          <div className="flex items-end gap-[3px] h-28">
            {dailyData.map(([day, count]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className="w-full rounded-sm bg-emerald-500/70 hover:bg-emerald-500 transition-colors min-h-[2px]"
                  style={{ height: barWidth(count, dailyMax) }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                  {day.slice(5)}: {count}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground/50">
            <span>{dailyData[0]?.[0]?.slice(5)}</span>
            <span>Today</span>
          </div>
        </Section>

        {/* ── Two columns: Programs + Search ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Programs */}
          <Section title="Top Programs" subtitle="By outbound clicks (30d)">
            {topPrograms.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {topPrograms.map((p, i) => (
                  <div key={p.slug} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right text-xs text-muted-foreground/50">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-xs">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">{p.views}v · {p.clicks}c</span>
                        {p.ctr > 0 && (
                          <span className="text-[10px] text-emerald-500">{(p.ctr * 100).toFixed(0)}%</span>
                        )}
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500/70"
                          style={{ width: barWidth(p.clicks, topProgramMax) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Search Intelligence */}
          <Section title="Search Intelligence" subtitle="What people want (30d)">
            {topSearches.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {topSearches.map(([q, count], i) => (
                  <div key={q} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-right text-xs text-muted-foreground/50">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-xs">&ldquo;{q}&rdquo;</span>
                        <span className="text-[10px] text-muted-foreground">{count}x</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500/70"
                          style={{ width: barWidth(count, topSearchMax) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {uniqueZeroResults.length > 0 && (
              <div className="mt-6 pt-4 border-t border-border/30">
                <p className="text-[10px] uppercase tracking-wide text-red-400/80 font-medium mb-2">
                  Unmet Demand (zero results)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {uniqueZeroResults.map((q) => (
                    <span key={q} className="rounded-md border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[11px] text-red-400">
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* ── Distribution: Countries + Referrers + Device ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Countries */}
          <Section title="Countries" subtitle="30d">
            {topCountries.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {topCountries.map(([code, count]) => (
                  <div key={code} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center">{FLAG[code] ?? "🌍"}</span>
                    <span className="w-7 text-muted-foreground">{code}</span>
                    <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-sky-500/70"
                        style={{ width: barWidth(count, topCountryMax) }}
                      />
                    </div>
                    <span className="w-8 text-right text-muted-foreground tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Referrers */}
          <Section title="Traffic Sources" subtitle="30d">
            {topReferrers.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {topReferrers.map(([host, count]) => (
                  <div key={host} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{host}</span>
                        <span className="text-muted-foreground tabular-nums">{count}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500/70"
                          style={{ width: barWidth(count, topRefMax) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Device + Sessions */}
          <Section title="Audience" subtitle="30d">
            <div className="space-y-4">
              {/* Device split */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium mb-2">Device</p>
                <div className="flex h-3 rounded-full overflow-hidden bg-muted/30">
                  {desktopCount > 0 && (
                    <div
                      className="bg-sky-500/70 h-full"
                      style={{ width: pct(desktopCount, desktopCount + mobileCount) }}
                    />
                  )}
                  {mobileCount > 0 && (
                    <div
                      className="bg-amber-500/70 h-full"
                      style={{ width: pct(mobileCount, desktopCount + mobileCount) }}
                    />
                  )}
                </div>
                <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                  <span>Desktop {pct(desktopCount, desktopCount + mobileCount)}</span>
                  <span>Mobile {pct(mobileCount, desktopCount + mobileCount)}</span>
                </div>
              </div>

              {/* Session depth */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium mb-2">Sessions</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/30 bg-card/30 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums">{avgSessionDepth}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Avg depth</div>
                  </div>
                  <div className="rounded-lg border border-border/30 bg-card/30 p-3 text-center">
                    <div className="text-lg font-bold tabular-nums">{deepSessions}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Deep (5+ events)</div>
                  </div>
                </div>
              </div>

              {/* Total sessions */}
              <div className="rounded-lg border border-border/30 bg-card/30 p-3 text-center">
                <div className="text-lg font-bold tabular-nums">{sessionMap.size}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Total sessions (30d)</div>
              </div>
            </div>
          </Section>
        </div>

        {/* ── Two columns: Pages + Categories ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top Pages */}
          <Section title="Top Pages" subtitle="30d">
            {topPages.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {topPages.map(([path, count]) => (
                  <div key={path} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px]">{path}</span>
                        <span className="text-muted-foreground tabular-nums shrink-0">{count}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500/50"
                          style={{ width: barWidth(count, topPageMax) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Category Interest */}
          <Section title="Category Interest" subtitle="Filters + page views (30d)">
            {topCategories.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {topCategories.map(([cat, count]) => (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cat}</span>
                        <span className="text-muted-foreground tabular-nums">{count}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500/60"
                          style={{ width: barWidth(count, topCatMax) }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── UTM Campaigns ── */}
        {topUtm.length > 0 && (
          <Section title="Campaigns" subtitle="UTM tracking (30d)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {topUtm.map(([key, count]) => (
                <div key={key} className="rounded-lg border border-border/30 bg-card/30 p-3">
                  <div className="text-lg font-bold tabular-nums">{count}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{key}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Live Feed ── */}
        <Section title="Live Feed" subtitle="Latest events">
          <div className="space-y-1">
            {feed.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs hover:bg-muted/20 transition-colors"
              >
                <EventDot type={e.type} />
                <span className="w-24 shrink-0 font-medium">{e.type}</span>
                <span className="flex-1 truncate text-muted-foreground font-mono text-[11px]">
                  {e.slug ?? e.path ?? "—"}
                </span>
                {e.country && (
                  <span className="shrink-0">{FLAG[e.country] ?? e.country}</span>
                )}
                <span className="w-14 shrink-0 text-right text-muted-foreground/60">{e.device ?? "—"}</span>
                <span className="w-16 shrink-0 text-right text-muted-foreground/50 tabular-nums">
                  {ago(e.created_at)}
                </span>
              </div>
            ))}
            {feed.length === 0 && <Empty />}
          </div>
        </Section>

        {/* Footer */}
        <div className="mt-10 text-center text-[11px] text-muted-foreground/40">
          Data retention: 60 days · Refresh: on page load · IP hashed (privacy-safe)
        </div>
      </div>
    </div>
  );
}

// ── Components ──────────────────────────────────────────

function KpiCard({
  label,
  today,
  d7,
  d30,
  prev30,
  highlight,
}: {
  label: string;
  today: number;
  d7: number;
  d30: number;
  prev30: number;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-5 ${highlight ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/40 bg-card/30"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 font-medium">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${highlight ? "text-emerald-500" : ""}`}>
          {d30.toLocaleString()}
        </span>
        <span className={`text-xs font-medium ${deltaClass(d30, prev30)}`}>
          {delta(d30, prev30)}
        </span>
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
        <span>Today: <strong className="text-foreground">{today}</strong></span>
        <span>7d: <strong className="text-foreground">{d7}</strong></span>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/20 p-5 mb-6">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <span className="text-[10px] text-muted-foreground/50">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function FunnelBar({
  label,
  value,
  max,
  accent,
}: {
  label: string;
  value: number;
  max: number;
  accent?: boolean;
}) {
  const h = max > 0 ? Math.max(8, (value / max) * 100) : 8;
  return (
    <div className="flex-1 flex flex-col items-center gap-2">
      <span className="text-sm font-bold tabular-nums">{value.toLocaleString()}</span>
      <div
        className={`w-full rounded-lg transition-all ${accent ? "bg-emerald-500/70" : "bg-muted/60"}`}
        style={{ height: `${h}%` }}
      />
      <span className="text-[10px] text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function FunnelArrow({ rate }: { rate: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2">
      <span className="text-[10px] text-emerald-500 font-medium">{rate}</span>
      <span className="text-muted-foreground/30">→</span>
    </div>
  );
}

function EventDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    page_view: "bg-sky-500",
    search: "bg-blue-500",
    program_view: "bg-violet-500",
    outbound_click: "bg-emerald-500",
    filter: "bg-amber-500",
    category_view: "bg-orange-500",
    network_view: "bg-pink-500",
    compare: "bg-cyan-500",
  };
  return <span className={`h-2 w-2 rounded-full shrink-0 ${colors[type] ?? "bg-muted-foreground"}`} />;
}

function Empty() {
  return (
    <div className="text-center py-8 text-xs text-muted-foreground/40">
      No data yet — check back when traffic arrives
    </div>
  );
}
