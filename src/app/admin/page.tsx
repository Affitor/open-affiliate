import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import Link from "next/link";
import { categoryCounts, getProgram, programs } from "@/lib/programs";

// Admin control room. Warm-Studio (Echoly) visual language: butter page,
// white cards, cocoa ink, tangerine accent, mono metadata. All colors are
// fixed hex on purpose — the page stays warm-light in both site themes.
const C = {
  bg: "#FFF8EC",
  card: "#FFFFFF",
  line: "#EADFD2",
  ink: "#3B2A1E",
  ink2: "#6B5244",
  ink3: "#8A715D",
  ink4: "#B09A8C",
  brand: "#F25B17",
  brandDown: "#C2440C",
  brandTint: "#FFF3E8",
  brandSoft: "#FFE0CC",
  peach: "#FFD9BC",
  mint: "#CDEBD8",
  success: "#2E9E5B",
};
const CARD_SHADOW = "0 6px 18px -8px rgba(59,42,30,0.10)";
const GRAD = "linear-gradient(135deg,#FF7A3C 0%,#F25B17 100%)";

interface EventRow {
  type: string;
  slug: string | null;
  metadata: { query?: string; resultCount?: number } | null;
  country: string | null;
  device: string | null;
  referrer: string | null;
  session_id: string | null;
  ip_hash: string;
  created_at: string;
}

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function fetchEvents(sinceIso: string): Promise<EventRow[]> {
  const db = supa();
  const rows: EventRow[] = [];
  const PAGE = 1000;
  for (let i = 0; i < 25; i++) {
    const { data, error } = await db
      .from("events")
      .select("type,slug,metadata,country,device,referrer,session_id,ip_hash,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(i * PAGE, (i + 1) * PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as EventRow[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function delta(cur: number, prev: number): { text: string; up: boolean } | null {
  if (prev === 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { text: `${pct >= 0 ? "+" : ""}${pct}%`, up: pct >= 0 };
}

function flag(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function refHost(ref: string): string | null {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (!h || h.includes("openaffiliate") || h === "localhost") return null;
    return h;
  } catch {
    return null;
  }
}

const mono = { fontFamily: "var(--font-geist-mono)" } as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10.5px] font-medium uppercase"
      style={{ ...mono, color: C.ink3, letterSpacing: "0.06em" }}
    >
      {children}
    </div>
  );
}

function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: CARD_SHADOW }}
    >
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <Label>{title}</Label>
          {sub && (
            <span className="text-[11px]" style={{ ...mono, color: C.ink4 }}>
              {sub}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  d,
}: {
  label: string;
  value: string;
  sub?: string;
  d?: { text: string; up: boolean } | null;
}) {
  return (
    <div
      className="grid gap-2 rounded-2xl px-4 py-4"
      style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: CARD_SHADOW }}
    >
      <Label>{label}</Label>
      <div
        className="text-[28px] font-semibold leading-none"
        style={{ color: C.ink, letterSpacing: "-0.025em", fontFeatureSettings: '"tnum"' }}
      >
        {value}
      </div>
      <div className="flex items-center gap-2 text-[11px]" style={mono}>
        {d && <span style={{ color: d.up ? C.success : C.brandDown }}>{d.text}</span>}
        {sub && <span style={{ color: C.ink4 }}>{sub}</span>}
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  valueText,
  icon,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  valueText: string;
  icon?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[13px] font-medium" style={{ color: C.ink }}>
          {icon && <span className="text-sm leading-none">{icon}</span>}
          <span className="truncate">{label}</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ background: C.brandTint }}>
          <div
            className="h-1.5 rounded-full"
            style={{ width: `${max ? Math.max(3, (value / max) * 100) : 0}%`, background: GRAD }}
          />
        </div>
      </div>
      <div className="text-[12px]" style={{ ...mono, color: C.ink2, fontFeatureSettings: '"tnum"' }}>
        {valueText}
      </div>
    </div>
  );
}

function LoginGate({ error }: { error: boolean }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-6" style={{ background: C.bg }}>
      <div
        className="w-full max-w-sm rounded-3xl p-8"
        style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: "0 18px 50px -20px rgba(59,42,30,0.20)" }}
      >
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold text-white"
          style={{ background: GRAD, boxShadow: "0 8px 24px -10px rgba(242,91,23,0.35)" }}
        >
          OA
        </div>
        <h1 className="text-center text-2xl font-semibold" style={{ color: C.ink, letterSpacing: "-0.02em" }}>
          Admin access
        </h1>
        <p className="mt-1 mb-6 text-center text-sm" style={{ color: C.ink3 }}>
          Enter the admin key to open the control room.
        </p>
        <form method="POST" action="/api/admin/login" className="grid gap-3">
          <input
            type="password"
            name="key"
            placeholder="Admin key"
            autoFocus
            className="h-11 w-full rounded-xl px-4 text-sm outline-none"
            style={{ background: "#fff", border: `1px solid ${error ? C.brand : C.line}`, color: C.ink }}
          />
          {error && (
            <p className="text-center text-[12px]" style={{ ...mono, color: C.brandDown }}>
              Wrong key — try again.
            </p>
          )}
          <button
            type="submit"
            className="oa-press h-11 rounded-xl text-sm font-bold text-white"
            style={{ background: GRAD, boxShadow: `0 5px 0 ${C.brandDown}` }}
          >
            Open dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const jar = await cookies();
  const secret = process.env.ADMIN_SECRET;
  const authed = !!secret && jar.get("oa_admin")?.value === secret;

  if (!authed) return <LoginGate error={sp.error === "1"} />;

  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const now = Date.now();
  const since = new Date(now - days * 86400_000);
  const prevSince = new Date(now - 2 * days * 86400_000);

  const db = supa();
  const [events, votesRes, gapsRes, pairsRes] = await Promise.all([
    fetchEvents(prevSince.toISOString()),
    db.from("votes").select("program_slug"),
    db.from("top_search_gaps").select("query,times_searched,unique_searchers").order("times_searched", { ascending: false }).limit(8),
    db.from("top_program_pairs").select("slug_a,slug_b,co_view_sessions").order("co_view_sessions", { ascending: false }).limit(6),
  ]);

  const cur = events.filter((e) => new Date(e.created_at).getTime() >= since.getTime());
  const prev = events.filter((e) => new Date(e.created_at).getTime() < since.getTime());

  const count = (rows: EventRow[], type: string) => rows.filter((e) => e.type === type).length;
  const uniq = (rows: EventRow[]) => new Set(rows.map((e) => e.ip_hash)).size;

  // Daily series (UTC days, oldest → newest)
  const dayKey = (iso: string) => iso.slice(0, 10);
  const series: { day: string; pv: number; visitors: Set<string> }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    series.push({ day: dayKey(new Date(now - i * 86400_000).toISOString()), pv: 0, visitors: new Set() });
  }
  const byDay = new Map(series.map((s) => [s.day, s]));
  for (const e of cur) {
    const s = byDay.get(dayKey(e.created_at));
    if (!s) continue;
    if (e.type === "page_view") s.pv++;
    s.visitors.add(e.ip_hash);
  }
  const maxY = Math.max(1, ...series.map((s) => Math.max(s.pv, s.visitors.size)));

  // Top programs: views + outbound clicks
  const prog = new Map<string, { views: number; clicks: number }>();
  for (const e of cur) {
    if (!e.slug || (e.type !== "program_view" && e.type !== "outbound_click")) continue;
    const p = prog.get(e.slug) ?? { views: 0, clicks: 0 };
    if (e.type === "program_view") p.views++;
    else p.clicks++;
    prog.set(e.slug, p);
  }
  const topPrograms = [...prog.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 10);
  const maxViews = Math.max(1, ...topPrograms.map(([, v]) => v.views));

  // Searches
  const searches = new Map<string, number>();
  for (const e of cur) {
    const q = e.metadata?.query?.toLowerCase().trim();
    if (e.type === "search" && q) searches.set(q, (searches.get(q) ?? 0) + 1);
  }
  const topSearches = [...searches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Audience
  const tally = (pick: (e: EventRow) => string | null) => {
    const m = new Map<string, number>();
    for (const e of cur) {
      const k = pick(e);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const countries = tally((e) => e.country).slice(0, 7);
  const maxCountry = Math.max(1, ...countries.map(([, n]) => n));
  const referrers = tally((e) => (e.referrer ? refHost(e.referrer) : null)).slice(0, 6);
  const maxRef = Math.max(1, ...referrers.map(([, n]) => n));
  const mobile = cur.filter((e) => e.device === "mobile").length;
  const desktop = cur.filter((e) => e.device === "desktop").length;
  const mobilePct = mobile + desktop ? Math.round((mobile / (mobile + desktop)) * 100) : 0;

  // Votes
  const voteRows = (votesRes.data ?? []) as { program_slug: string }[];
  const voteCounts = new Map<string, number>();
  for (const v of voteRows) voteCounts.set(v.program_slug, (voteCounts.get(v.program_slug) ?? 0) + 1);
  const topVoted = [...voteCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxVotes = Math.max(1, ...topVoted.map(([, n]) => n));

  // Registry
  const verified = programs.filter((p) => p.verified).length;
  const topCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(1, ...topCategories.map(([, n]) => n));

  const gaps = (gapsRes.data ?? []) as { query: string; times_searched: number; unique_searchers: number }[];
  const pairs = (pairsRes.data ?? []) as { slug_a: string; slug_b: string; co_view_sessions: number }[];

  const name = (slug: string) => getProgram(slug)?.name ?? slug;
  const kpis: { label: string; value: string; sub?: string; d?: { text: string; up: boolean } | null }[] = [
    { label: "Visitors", value: fmt(uniq(cur)), d: delta(uniq(cur), uniq(prev)), sub: `prev ${fmt(uniq(prev))}` },
    { label: "Pageviews", value: fmt(count(cur, "page_view")), d: delta(count(cur, "page_view"), count(prev, "page_view")) },
    { label: "Program views", value: fmt(count(cur, "program_view")), d: delta(count(cur, "program_view"), count(prev, "program_view")) },
    { label: "Outbound clicks", value: fmt(count(cur, "outbound_click")), d: delta(count(cur, "outbound_click"), count(prev, "outbound_click")) },
    { label: "Searches", value: fmt(count(cur, "search")), d: delta(count(cur, "search"), count(prev, "search")) },
    { label: "Votes (all-time)", value: fmt(voteRows.length), sub: `${voteCounts.size} programs` },
  ];

  return (
    <div style={{ background: C.bg }} className="min-h-screen">
      <style>{`.oa-press{transition:transform .15s,box-shadow .15s}.oa-press:hover{transform:translateY(3px);box-shadow:0 2px 0 ${C.brandDown} !important}.oa-press:active{transform:translateY(5px);box-shadow:0 0 0 ${C.brandDown} !important}`}</style>
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: C.success }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: C.success }} />
              </span>
              <Label>OpenAffiliate · Control Room</Label>
            </div>
            <h1 className="text-[38px] font-semibold leading-tight" style={{ color: C.ink, letterSpacing: "-0.03em" }}>
              Registry <em className="not-italic" style={{ color: C.brand }}>pulse</em>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/admin?days=${d}`}
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                style={
                  d === days
                    ? { ...mono, background: C.ink, color: "#fff" }
                    : { ...mono, background: C.card, color: C.ink2, border: `1px solid ${C.line}` }
                }
              >
                {d}d
              </Link>
            ))}
            <form method="POST" action="/api/admin/login">
              <input type="hidden" name="action" value="logout" />
              <button
                type="submit"
                className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
                style={{ ...mono, background: C.card, color: C.ink3, border: `1px solid ${C.line}` }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>

        {/* Traffic + Registry health */}
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <Card title="Daily traffic" sub={`pageviews · unique visitors · last ${days}d`} className="lg:col-span-2">
            <div className="flex h-44 items-end gap-[3px]">
              {series.map((s) => (
                <div key={s.day} className="relative h-full flex-1" title={`${s.day} — ${s.pv} pageviews, ${s.visitors.size} visitors`}>
                  <div className="absolute bottom-0 w-full rounded-t-md" style={{ height: `${(s.visitors.size / maxY) * 100}%`, background: GRAD, minHeight: s.visitors.size ? 3 : 0 }} />
                  <div className="absolute bottom-0 w-full rounded-t-md" style={{ height: `${(s.pv / maxY) * 100}%`, background: C.peach, minHeight: s.pv ? 3 : 0, opacity: 0.9 }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10.5px]" style={{ ...mono, color: C.ink4 }}>
              <span>{series[0]?.day.slice(5)}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C.peach }} />pageviews</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: C.brand }} />visitors</span>
              </span>
              <span>{series[series.length - 1]?.day.slice(5)}</span>
            </div>
          </Card>

          <Card title="Registry health" sub="from programs/">
            <div className="mb-1 text-[28px] font-semibold" style={{ color: C.ink, fontFeatureSettings: '"tnum"' }}>
              {programs.length}
              <span className="ml-2 text-[13px] font-medium" style={{ ...mono, color: C.ink3 }}>programs</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-[11px]" style={{ ...mono, color: C.ink3 }}>
              <span>verified {verified}</span>
              <span>{Math.round((verified / Math.max(1, programs.length)) * 100)}%</span>
            </div>
            <div className="mb-5 h-2 rounded-full" style={{ background: C.brandTint }}>
              <div className="h-2 rounded-full" style={{ width: `${(verified / Math.max(1, programs.length)) * 100}%`, background: C.mint, border: `1px solid ${C.success}33` }} />
            </div>
            {topCategories.map(([cat, n]) => (
              <BarRow key={cat} label={cat} value={n} max={maxCat} valueText={String(n)} />
            ))}
          </Card>
        </div>

        {/* Top programs */}
        <Card title="Top programs" sub={`views → outbound clicks · last ${days}d`} className="mb-6">
          <div className="grid gap-x-10 md:grid-cols-2">
            {topPrograms.map(([slug, v], i) => (
              <div key={slug} className="grid grid-cols-[18px_1fr_auto] items-center gap-3 border-b py-2.5 last:border-b-0 md:[&:nth-child(9)]:border-b-0" style={{ borderColor: C.brandTint }}>
                <span className="text-[11px]" style={{ ...mono, color: C.ink4 }}>{i + 1}</span>
                <div className="min-w-0">
                  <Link href={`/programs/${slug}`} className="block truncate text-[13.5px] font-medium hover:underline" style={{ color: C.ink }}>
                    {name(slug)}
                  </Link>
                  <div className="mt-1 h-1.5 w-full rounded-full" style={{ background: C.brandTint }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (v.views / maxViews) * 100)}%`, background: GRAD }} />
                  </div>
                </div>
                <div className="text-right text-[11.5px]" style={{ ...mono, color: C.ink2, fontFeatureSettings: '"tnum"' }}>
                  <div>{v.views} views</div>
                  <div style={{ color: v.clicks ? C.success : C.ink4 }}>
                    {v.clicks} clicks{v.views ? ` · ${Math.round((v.clicks / v.views) * 100)}%` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Search intel + Audience */}
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-6">
            <Card title="Top searches" sub={`last ${days}d`}>
              {topSearches.length === 0 && <p className="text-sm" style={{ color: C.ink4 }}>No searches yet.</p>}
              {topSearches.map(([q, n]) => (
                <BarRow key={q} label={`"${q}"`} value={n} max={topSearches[0]?.[1] ?? 1} valueText={`${n}×`} />
              ))}
            </Card>
            <Card title="Search gaps — zero results" sub="all-time · product ideas">
              {gaps.length === 0 && <p className="text-sm" style={{ color: C.ink4 }}>No gaps recorded.</p>}
              <div className="flex flex-wrap gap-2">
                {gaps.map((g) => (
                  <span
                    key={g.query}
                    title={`${g.times_searched} searches · ${g.unique_searchers} searchers`}
                    className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
                    style={{ ...mono, background: C.brandTint, color: C.brandDown, border: `1px solid ${C.brandSoft}` }}
                  >
                    {g.query} · {g.times_searched}×
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <Card title="Audience" sub={`countries · devices · referrers · last ${days}d`}>
            {countries.map(([cc, n]) => (
              <BarRow key={cc} icon={flag(cc)} label={cc} value={n} max={maxCountry} valueText={fmt(n)} />
            ))}
            <div className="mt-5 mb-2 flex items-center justify-between text-[11px]" style={{ ...mono, color: C.ink3 }}>
              <span>mobile {mobilePct}%</span>
              <span>desktop {100 - mobilePct}%</span>
            </div>
            <div className="mb-5 flex h-2 overflow-hidden rounded-full" style={{ background: C.brandTint }}>
              <div style={{ width: `${mobilePct}%`, background: GRAD }} />
              <div style={{ width: `${100 - mobilePct}%`, background: C.mint }} />
            </div>
            <Label>Top referrers</Label>
            <div className="mt-2">
              {referrers.length === 0 && <p className="text-sm" style={{ color: C.ink4 }}>Direct traffic only.</p>}
              {referrers.map(([host, n]) => (
                <BarRow key={host} label={host} value={n} max={maxRef} valueText={fmt(n)} />
              ))}
            </div>
          </Card>
        </div>

        {/* Community + Co-views */}
        <div className="mb-10 grid gap-6 lg:grid-cols-2">
          <Card title="Most voted programs" sub="community upvotes · all-time">
            {topVoted.length === 0 && <p className="text-sm" style={{ color: C.ink4 }}>No votes yet.</p>}
            {topVoted.map(([slug, n]) => (
              <BarRow key={slug} label={name(slug)} value={n} max={maxVotes} valueText={`▲ ${n}`} />
            ))}
          </Card>
          <Card title="Compared together" sub="programs co-viewed in one session">
            {pairs.length === 0 && <p className="text-sm" style={{ color: C.ink4 }}>Not enough sessions yet.</p>}
            {pairs.map((p) => (
              <div key={`${p.slug_a}-${p.slug_b}`} className="flex items-center justify-between gap-3 border-b py-2.5 text-[13px] last:border-b-0" style={{ borderColor: C.brandTint }}>
                <span className="min-w-0 truncate font-medium" style={{ color: C.ink }}>
                  {name(p.slug_a)} <span style={{ color: C.ink4 }}>vs</span> {name(p.slug_b)}
                </span>
                <span className="shrink-0 text-[11.5px]" style={{ ...mono, color: C.ink2 }}>
                  {p.co_view_sessions} sessions
                </span>
              </div>
            ))}
          </Card>
        </div>

        <p className="pb-6 text-center text-[11px]" style={{ ...mono, color: C.ink4 }}>
          Sources: Supabase events · votes · search-gap &amp; co-view views · programs registry. Rendered {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.
        </p>
      </div>
    </div>
  );
}
