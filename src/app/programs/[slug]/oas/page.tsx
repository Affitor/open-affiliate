import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, Clock, ExternalLink, Info, Minus, Star } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { categoryToSlug, getProgram, IN_HOUSE, livePrograms } from "@/lib/programs";
import { networkName } from "@/lib/network-meta";
import { isAffitorHref } from "@/lib/affitor-link";
import {
  buildBoard,
  categoryRank,
  CHECKS,
  checkedUrls,
  getOasScore,
  GROUPS,
  improveText,
  oasScores,
  oasValue,
  PART_MAX,
  partEarned,
  rankText,
  round1,
  TEAM_DISCLOSURE,
  UNRANKED_TEXT,
  type CheckGroup,
  type OasCheck,
  type OasScore,
  type Part,
} from "@/lib/oas";

export const revalidate = 86400;

const REPO = "https://github.com/Affitor/open-affiliate";

function readableDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A GitHub issue prefilled with the program and report, open to anyone; no claim needed. */
function reportErrorUrl(name: string, slug: string): string {
  const title = `OAS error: ${name} (${slug})`;
  const body = `Report: https://openaffiliate.dev/programs/${slug}/oas\n\nWhich check is wrong (for example P2 Minimum threshold):\n\nWhat the public page says, with its URL:\n`;
  return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const program = getProgram(slug);
  const score = getOasScore(slug);
  if (!program || !score) return {};
  const value = oasValue(score);
  const title = `${program.name} OAS report`;
  const description = value == null
    ? `How clearly the ${program.name} affiliate program publishes its terms. Scoring in progress.`
    : `${program.name} affiliate program: OAS ${value}/100. How clearly it publishes its terms and protects partners, check by check, from public pages.`;
  return { title, description, alternates: { canonical: `/programs/${slug}/oas` }, openGraph: { title, description } };
}

type Group = CheckGroup & { checks: OasCheck[]; earned: number; max: number; met: number };

function groupsOf(score: OasScore, part: Part): Group[] {
  return GROUPS.filter((g) => g.part === part).map((g) => {
    const checks = g.ids.flatMap((id) => score.checks.filter((c) => c.id === id));
    return {
      ...g,
      checks,
      earned: round1(checks.reduce((a, c) => a + (c.state === "met" ? c.points : 0), 0)),
      max: round1(g.ids.reduce((a, id) => a + CHECKS[id].max, 0)),
      met: checks.filter((c) => c.state === "met").length,
    };
  });
}

/**
 * A page the reviewer read. Affitor pages (programs on the Affitor network) stay
 * plain text: every affitor.com link on the site carries UTM and a click event,
 * and evidence is not a referral.
 */
function evidenceLink(url: string, label: React.ReactNode, className: string) {
  if (!/^https?:\/\//.test(url) || isAffitorHref(url)) return <span className="text-muted-foreground">{typeof label === "string" ? label : url}</span>;
  return <a href={url} target="_blank" rel="noopener nofollow" className={className}>{label}</a>;
}

const STATE_TAG: Record<OasCheck["state"], string | null> = { met: null, not_met: "Not met", not_public: "Not public", checking: "Checking" };

function StateIcon({ state }: { state: OasCheck["state"] }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  if (state === "met") return <Check className={`${cls} text-good`} aria-label="Met" />;
  if (state === "checking") return <Clock className={`${cls} text-muted-foreground`} aria-label="Checking" />;
  return <Minus className={`${cls} text-muted-foreground`} aria-label={STATE_TAG[state]!} />;
}

function Bar({ earned, max }: { earned: number; max: number }) {
  return (
    <span className="block h-1 w-full rounded-full bg-sunk" aria-hidden>
      <span className="block h-1 rounded-full bg-foreground" style={{ width: `${Math.round((earned / max) * 100)}%` }} />
    </span>
  );
}

function CheckRow({ c, date, scored }: { c: OasCheck; date: string; scored: boolean }) {
  const def = CHECKS[c.id];
  const tag = STATE_TAG[c.state];
  const fixable = c.state === "not_met" || c.state === "not_public";
  const urls = checkedUrls(c);
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[18px_minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 py-3.5 border-t border-border first:border-t-0">
      <StateIcon state={c.state} />
      <div className="min-w-0">
        <p className="font-medium flex flex-wrap items-center gap-2">
          {def.label}
          {tag && <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">{tag}</span>}
        </p>
        {c.state === "met" && c.quote && (
          <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 font-mono text-xs text-muted-foreground break-words">“{c.quote}”</p>
        )}
        {c.state === "not_met" && c.quote && <p className="text-sm text-foreground/80 mt-0.5">{c.quote}</p>}
        {c.state === "not_public" && (
          <p className="text-sm text-foreground/80 mt-0.5">
            {c.quote ? `${c.quote.replace(/\.?$/, ".")} ` : ""}Only available after login or approval, so it scores 0 until it is on a public page.
          </p>
        )}
        {c.state === "checking" && (
          <p className="text-sm text-foreground/80 mt-0.5">We could not finish this check yet. This is on our side, and nothing is counted against the program meanwhile.</p>
        )}
        {c.state === "not_met" && urls.length > 0 && (
          <div className="text-xs text-muted-foreground mt-1.5">
            <p>Checked {readableDate(date)}:</p>
            <ul className="mt-0.5">
              {urls.map((u) => (
                <li key={u} className="break-all">{evidenceLink(u, u, "underline underline-offset-2 hover:text-foreground")}</li>
              ))}
            </ul>
          </div>
        )}
        {fixable && (
          <details className="group/how mt-1.5 text-sm">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
              How to add {def.max} points <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/how:rotate-180" aria-hidden />
            </summary>
            <p className="mt-1.5 text-foreground/80">{improveText(c)}</p>
          </details>
        )}
      </div>
      <div className="col-start-2 sm:col-start-3 sm:row-start-1 flex items-start gap-3.5 text-meta whitespace-nowrap">
        {scored && (
          <span className="font-mono">
            {c.state === "met" ? c.points : fixable ? <span className="text-muted-foreground">+{def.max}</span> : null}
          </span>
        )}
        {c.state === "met" && c.url && evidenceLink(
          checkedUrls(c)[0],
          <>Source <ExternalLink className="h-3 w-3" aria-hidden /></>,
          "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground",
        )}
      </div>
    </div>
  );
}

function Accordion({ groups, date, scored }: { groups: Group[]; date: string; scored: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {groups.map((g) => (
        <details key={g.key} className="group border-t border-border first:border-t-0">
          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_18px] sm:grid-cols-[minmax(0,1fr)_96px_140px_88px_18px] items-center gap-3 sm:gap-5 px-4 sm:px-5 py-4 hover:bg-sunk [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">{g.name}</span>
            <span className="hidden sm:block text-meta text-muted-foreground text-right">{g.met} of {g.checks.length} met</span>
            <span className="hidden sm:block">{scored && <Bar earned={g.earned} max={g.max} />}</span>
            <span className="font-mono text-right">{scored && <>{g.earned}<span className="text-meta text-muted-foreground">/{g.max}</span></>}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border px-4 sm:px-5 pb-2">
            <p className="text-sm text-foreground/80 pt-3 pb-1">{g.about}</p>
            {g.checks.map((c) => <CheckRow key={c.id} c={c} date={date} scored={scored} />)}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function OasReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = getProgram(slug);
  const score = getOasScore(slug);
  if (!program || !score) notFound();

  const value = oasValue(score);
  const scored = value != null;
  const board = buildBoard(oasScores, livePrograms, new Date());
  const row = board.find((r) => r.program.slug === slug);
  const rankLine = rankText(categoryRank(board, slug));
  const unranked = row?.unranked;
  const network = program.network && program.network !== IN_HOUSE ? networkName(program.network) : null;
  const t = groupsOf(score, "transparency");
  const v = groupsOf(score, "partner_value");
  const strongest = scored ? [...t, ...v].filter((g) => g.earned / g.max >= 0.8) : [];
  const fixes = score.checks
    .filter((c) => c.state === "not_met" || c.state === "not_public")
    .sort((a, b) => CHECKS[b.id].max - CHECKS[a.id].max);
  const recoverable = round1(fixes.reduce((a, c) => a + CHECKS[c.id].max, 0));
  const errorUrl = reportErrorUrl(program.name, slug);

  const partTotal = (part: Part, groups: Group[]) => (
    <span className="font-mono text-subtitle">
      {scored ? <>{partEarned(score, part)}<span className="text-muted-foreground">/{PART_MAX[part]}</span></> : <span className="text-sm font-sans text-muted-foreground">{groups.some((g) => g.checks.some((c) => c.state === "checking")) ? "Checking" : "Done"}</span>}
    </span>
  );

  return (
    <div className="oa-frame px-4 sm:px-12 pt-6 sm:pt-10 pb-12">
      <nav className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/programs" prefetch={false} className="hover:text-foreground transition-colors">Programs</Link>
        <span>/</span>
        <Link href={`/categories/${categoryToSlug(program.category)}`} className="hover:text-foreground transition-colors">{program.category}</Link>
        <span>/</span>
        <Link href={`/programs/${slug}`} className="hover:text-foreground transition-colors">{program.name}</Link>
        <span>/</span>
        <span className="text-foreground/80">OAS report</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8 lg:gap-12 mt-6 items-start">
        <div>
          <div className="flex items-center gap-4">
            <ProgramLogo slug={program.slug} name={program.name} size={64} className="shrink-0 rounded-[14px] border border-border bg-white" />
            <div className="min-w-0">
              <p className="oa-label">OAS report · OpenAffiliate Score</p>
              <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-1">{program.name}</h1>
            </div>
          </div>
          <p className="text-base text-foreground/80 mt-5 max-w-xl">
            How clearly the program publishes its terms, and what it promises partners in public. Not how much it pays.
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 text-meta text-muted-foreground">
            <span>Reviewed <span className="text-foreground font-medium">{readableDate(score.checked_at)}</span></span>
            <span>Rubric <span className="text-foreground font-medium">OAS v0.2</span></span>
            <span>{network ? <>Runs on <span className="text-foreground font-medium">{network}</span></> : <>Runs <span className="text-foreground font-medium">directly</span></>}</span>
          </p>
          {strongest.length > 0 && (
            <div className="mt-6">
              <p className="oa-label">Strongest</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {strongest.slice(0, 4).map((g) => (
                  <span key={g.key} className="inline-flex items-center gap-1 rounded-md border border-good-line bg-good-bg px-2 py-0.5 text-xs text-good">
                    <Check className="h-3 w-3" aria-hidden />{g.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside aria-label="Score" className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <p className="oa-label">OAS · OpenAffiliate Score</p>
          {scored ? (
            <p className="flex flex-wrap items-baseline gap-x-2 mt-2">
              <span className="font-mono font-medium text-[52px] sm:text-[76px] leading-none tracking-[-0.05em]">{value}</span>
              <span className="font-mono text-subtitle text-muted-foreground">/100</span>
            </p>
          ) : (
            <>
              <p className="text-title font-semibold tracking-tight mt-2">Scoring in progress</p>
              <p className="text-sm text-muted-foreground mt-1.5">Some checks are not finished yet. The score appears when they are; nothing is counted against {program.name} meanwhile.</p>
            </>
          )}
          {rankLine ? (
            <p className="inline-flex items-center gap-1.5 mt-3.5 text-sm font-medium"><Star className="h-3.5 w-3.5" aria-hidden />{rankLine}</p>
          ) : unranked && unranked !== "checking" ? (
            <p className="text-sm text-muted-foreground mt-3.5">{UNRANKED_TEXT[unranked]}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
            <div><p className="oa-label">Transparency</p><p className="mt-1">{partTotal("transparency", t)}</p></div>
            <div><p className="oa-label">Partner value</p><p className="mt-1">{partTotal("partner_value", v)}</p></div>
          </div>
          <a href={errorUrl} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground">
            Report an error <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </aside>
      </div>

      {(unranked === "same-team" || unranked === "affitor") && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground mt-6"><Info className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />{UNRANKED_TEXT[unranked]}. Scored with the same rules as every program.</p>
      )}

      {fixes.length > 0 && (
        <details className="group mt-10 rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-5 py-3.5 font-medium hover:bg-sunk [&::-webkit-details-marker]:hidden">
            {fixes.length} ways to add up to {recoverable} points
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="border-t border-border px-4 sm:px-5 py-2.5 text-meta text-muted-foreground">Biggest first. A term that is not on a public page counts once it is published.</p>
          <ul>
            {fixes.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3.5 border-t border-border px-4 sm:px-5 py-2.5 text-sm">
                <span>{CHECKS[c.id].label}{c.state === "not_public" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Not public</span>}</span>
                <span className="hidden sm:block text-meta text-muted-foreground">{CHECKS[c.id].group}</span>
                <span className="font-mono text-meta">+{CHECKS[c.id].max}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="mt-10" aria-labelledby="t-h">
        <div className="flex items-baseline justify-between gap-3 mb-3"><h2 id="t-h" className="text-lg font-semibold">Transparency</h2>{partTotal("transparency", t)}</div>
        <Accordion groups={t} date={score.checked_at} scored={scored} />
      </section>
      <section className="mt-8" aria-labelledby="v-h">
        <div className="flex items-baseline justify-between gap-3 mb-3"><h2 id="v-h" className="text-lg font-semibold">Partner value</h2>{partTotal("partner_value", v)}</div>
        <Accordion groups={v} date={score.checked_at} scored={scored} />
      </section>

      <div className="mt-10 border-t border-border pt-6 text-meta text-muted-foreground max-w-3xl space-y-2">
        <p>
          Transparency: 25 checks, 70 points. Partner value: 11 checks, 30 points. OAS is one fixed number. Each check is Met, Not met, or Not public (0 points until published); while a page is still being read the report says Scoring in progress. Not scored: commission size, recurring or one-time, network, popularity, claiming, or any payment to OpenAffiliate.
        </p>
        <p>{TEAM_DISCLOSURE} Found a mistake? <a href={errorUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">Report an error</a>.</p>
      </div>
    </div>
  );
}
