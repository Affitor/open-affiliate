import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, Clock, ExternalLink, Minus, Star } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { PromptToImprove } from "@/components/prompt-to-improve";
import { ShareButton } from "@/components/share-button";
import { OasGradeChip } from "@/components/oas-grade";
import { categoryToSlug, getProgram, livePrograms } from "@/lib/programs";
import { isAffitorHref } from "@/lib/affitor-link";
import { machineChecks } from "@/lib/oas-machine";
import {
  buildBoard,
  categoryRank,
  CHECKS,
  getOasScore,
  GROUPS,
  fixItems,
  improvePrompt,
  improveText,
  isStale,
  verdictText,
  NOT_ASSESSED,
  oasScores,
  oasValue,
  PART_MAX,
  partEarned,
  rankText,
  TEAM_DISCLOSURE,
  round1,
  UNRANKED_TEXT,
  type CheckGroup,
  type OasCheck,
  type OasScore,
  type Part,
} from "@/lib/oas";

export const revalidate = 86400;

const REPO = "https://github.com/Affitor/open-affiliate";

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function readableDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** A GitHub issue prefilled with the program and report, open to anyone; no claim needed. */
function reportErrorUrl(name: string, slug: string): string {
  const title = `OAS error: ${name} (${slug})`;
  const body = `Report: https://openaffiliate.dev/programs/${slug}/oas\n\nWhich check is wrong (for example T4 Minimum payout):\n\nWhat the public page says, with its URL:\n`;
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
    : `${program.name} affiliate program: OAS ${value}/100. How clearly it publishes its terms and protects partners, check by check, from the terms verified on its own page.`;
  return { title, description, alternates: { canonical: `/programs/${slug}/oas` }, openGraph: { title, description } };
}

type Group = CheckGroup & { checks: OasCheck[]; earned: number; max: number; met: number; assessed: number };

function groupsOf(score: OasScore, part: Part): Group[] {
  return GROUPS.filter((g) => g.part === part).map((g) => {
    const checks = g.ids.flatMap((id) => score.checks.filter((c) => c.id === id));
    return {
      ...g,
      checks,
      earned: round1(checks.reduce((a, c) => a + c.points, 0)),
      max: round1(checks.reduce((a, c) => a + c.max, 0)),
      met: checks.filter((c) => c.state === "met").length,
      assessed: checks.filter((c) => c.state !== "held_out").length,
    };
  });
}

/**
 * The page the terms were verified on. Affitor pages (programs on the Affitor network) stay
 * plain text: every affitor.com link on the site carries UTM and a click event,
 * and evidence is not a referral.
 */
function evidenceLink(url: string, label: React.ReactNode, className: string) {
  if (!/^https?:\/\//.test(url) || isAffitorHref(url)) return <span className="text-muted-foreground">{typeof label === "string" ? label : url}</span>;
  return <a href={url} target="_blank" rel="noopener nofollow" className={className}>{label}</a>;
}

const STATE_TAG: Record<OasCheck["state"], string | null> = { met: null, not_met: "Not met", not_public: "Not published", checking: "Checking", held_out: NOT_ASSESSED };

function StateIcon({ state }: { state: OasCheck["state"] }) {
  const cls = "h-4 w-4 mt-0.5 shrink-0";
  if (state === "met") return <Check className={`${cls} text-good`} aria-label="Met" />;
  if (state === "checking") return <Clock className={`${cls} text-muted-foreground`} aria-label="Checking" />;
  return <Minus className={`${cls} text-muted-foreground`} aria-label={STATE_TAG[state]!} />;
}

function Bar({ earned, max }: { earned: number; max: number }) {
  return (
    <span className="block h-1 w-full rounded-full bg-sunk" aria-hidden>
      <span className="block h-1 rounded-full bg-foreground" style={{ width: `${max ? Math.round((earned / max) * 100) : 0}%` }} />
    </span>
  );
}

function CheckRow({ c, date, pageUrl, scored }: { c: OasCheck; date: string; pageUrl: string | null; scored: boolean }) {
  const def = CHECKS[c.id];
  const tag = c.state === "not_public" ? `Not published (checked ${readableDate(c.checked ?? date)})` : STATE_TAG[c.state];
  const fixable = c.state === "not_met" || c.state === "not_public";
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[18px_minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 py-3.5 border-t border-border first:border-t-0">
      <StateIcon state={c.state} />
      <div className="min-w-0">
        <p className="font-medium flex flex-wrap items-center gap-2">
          {def.label}
          {tag && <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">{tag}</span>}
        </p>
        {c.fact && <p className="text-sm text-foreground/80 mt-0.5">{c.fact}</p>}
        {c.conflict && <p className="text-sm text-foreground/80 mt-0.5">Your pages disagree: {c.conflict}</p>}
        {c.state === "checking" && (
          <p className="text-sm text-foreground/80 mt-0.5">We could not finish this check yet. This is on our side, and nothing is counted against the program meanwhile.</p>
        )}
        {c.state === "held_out" && <p className="text-sm text-foreground/80 mt-0.5">Its points count toward the other checks in this part, so it costs the program nothing.</p>}
        {(c.state === "met" || c.state === "not_met") && pageUrl && (
          <p className="text-xs text-muted-foreground mt-1.5">
            {evidenceLink(pageUrl, <>Page checked <ExternalLink className="h-3 w-3" aria-hidden /></>, "inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground")} · {readableDate(date)}
          </p>
        )}
        {fixable && (
          <details className="group/how mt-1.5 text-sm">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-foreground/80 hover:text-foreground [&::-webkit-details-marker]:hidden">
              How to add {round1(c.max)} points <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/how:rotate-180" aria-hidden />
            </summary>
            <p className="mt-1.5 text-foreground/80">{improveText(c)}</p>
          </details>
        )}
      </div>
      {scored && (
        <div className="col-start-2 sm:col-start-3 sm:row-start-1 text-meta whitespace-nowrap font-mono">
          {c.state === "met" ? round1(c.points) : fixable ? <span className="text-muted-foreground">+{round1(c.max)}</span> : null}
        </div>
      )}
    </div>
  );
}

function Accordion({ groups, date, pageUrl, scored }: { groups: Group[]; date: string; pageUrl: string | null; scored: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {groups.map((g) => (
        <details key={g.key} className="group border-t border-border first:border-t-0">
          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_18px] sm:grid-cols-[minmax(0,1fr)_96px_140px_88px_18px] items-center gap-3 sm:gap-5 px-4 sm:px-5 py-4 hover:bg-sunk [&::-webkit-details-marker]:hidden">
            <span className="font-semibold">{g.name}</span>
            <span className="hidden sm:block text-meta text-muted-foreground text-right">{g.met} of {g.assessed} met</span>
            <span className="hidden sm:block">{scored && <Bar earned={g.earned} max={g.max} />}</span>
            <span className="font-mono text-right">{scored && <>{g.earned}<span className="text-meta text-muted-foreground">/{g.max}</span></>}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="border-t border-border px-4 sm:px-5 pb-2">
            <p className="text-sm text-foreground/80 pt-3 pb-1">{g.about}</p>
            {g.checks.map((c) => <CheckRow key={c.id} c={c} date={date} pageUrl={pageUrl} scored={scored} />)}
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
  const machine = machineChecks(slug);
  const board = buildBoard(oasScores, livePrograms, new Date());
  const row = board.find((r) => r.program.slug === slug);
  const rankLine = rankText(categoryRank(board, slug));
  const unranked = row?.unranked;
  const t = groupsOf(score, "transparency");
  const v = groupsOf(score, "partner_value");
  const items = fixItems(score);
  const waiting = score.checks.filter((c) => c.state === "checking");
  const verdict = verdictText(score);
  // Every term read, but verified more than 90 days ago: no score until we verify it again.
  // Stale is checked first: every term may also read as not assessed once it is old.
  const stale = !scored && isStale(score.checked_at, new Date());
  const prompt = stale ? "" : improvePrompt(program, score);
  const domain = host(program.url);
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
          <div className="flex flex-wrap items-center gap-3">
            <ProgramLogo slug={program.slug} name={program.name} size={32} className="shrink-0 rounded-lg border border-border bg-white" />
            <span className="font-mono text-sm text-muted-foreground">{domain}</span>
            <ShareButton path={`/programs/${slug}/oas`} title={`${program.name} OAS report`} />
          </div>
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-4">
            {program.name}: {(verdict ?? (stale ? "Terms to verify again" : "Scoring in progress")).toLowerCase()}
          </h1>
          <div className="flex items-end gap-4 mt-5">
            {scored ? (
              <p className="flex items-baseline gap-x-2">
                <span className="font-mono font-medium text-[52px] sm:text-[76px] leading-none tracking-[-0.05em]">{value}</span>
                <span className="font-mono text-subtitle text-muted-foreground">/100</span>
                <OasGradeChip score={value!} className="ml-1 self-center" />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground max-w-md">
                {stale
                  ? `Its terms were last verified ${readableDate(score.checked_at)}, more than 90 days ago. The score returns once we verify them again.`
                  : `Some of its terms are not read yet. The score appears once every term is read; nothing is counted against ${program.name} meanwhile.`}
              </p>
            )}
          </div>
          {rankLine ? (
            <p className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium"><Star className="h-3.5 w-3.5" aria-hidden />{rankLine}</p>
          ) : unranked && unranked !== "checking" ? (
            <p className="text-sm text-muted-foreground mt-3">{UNRANKED_TEXT[unranked]}</p>
          ) : null}
          {prompt && <PromptToImprove slug={slug} text={prompt} />}
          <p className="mt-4 text-meta text-muted-foreground">
            Terms checked {readableDate(score.checked_at)}
            {score.page_url && <> on {evidenceLink(score.page_url, host(score.page_url), "underline underline-offset-2 hover:text-foreground")}</>}
            {" · "}
            <a href={errorUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">Report an error</a>
          </p>
        </div>

        <aside aria-label="Score by part" className="border-t border-border">
          {([["transparency", t, "terms published"], ["partner_value", v, "partner terms met"]] as const).map(([part, groups, what]) => (
            <div key={part} className="flex items-start justify-between gap-3 border-b border-border py-3.5">
              <div>
                <p className="font-medium">{part === "transparency" ? "Transparency" : "Partner value"}</p>
                <p className="text-meta text-muted-foreground">
                  {groups.reduce((a, g) => a + g.met, 0)} of {groups.reduce((a, g) => a + g.assessed, 0)} {what}
                </p>
              </div>
              {partTotal(part, groups)}
            </div>
          ))}
        </aside>
      </div>

      {!stale && <section className="mt-12" aria-labelledby="fix-h">
        <h2 id="fix-h" className="text-lg font-semibold">{items.length ? "Fix these gaps first" : waiting.length ? "Terms we have not read yet" : "Nothing to fix"}</h2>
        <p className="text-meta text-muted-foreground mt-1">
          {items.length ? "Biggest first. A term counts once it is published and we verify it again." : waiting.length ? "The score appears once every term is read." : "Every term OAS checks is published and meets the partner checks."}
        </p>
        {items.length > 0 && (
          <ol className="mt-3 border-t border-border">
            {items.map((f, i) => (
              <li key={f.id} className="grid grid-cols-[28px_minmax(0,1fr)] sm:grid-cols-[36px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-border py-4">
                <span className="font-mono text-meta text-muted-foreground pt-0.5">{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="font-medium">{f.label} <span className="ml-1.5 rounded-md border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">{f.group}</span></p>
                  <p className="text-sm text-foreground/80 mt-1">{f.fix}</p>
                </div>
                <p className="col-start-2 sm:col-start-3 sm:row-start-1 font-mono text-meta sm:text-right whitespace-nowrap">
                  +{f.points}{f.extra && <span className="block text-muted-foreground">{f.extra}</span>}
                </p>
              </li>
            ))}
          </ol>
        )}
        {!items.length && waiting.length > 0 && (
          <ul className="mt-3 border-t border-border">
            {waiting.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-border py-3 text-sm"><Clock className="h-4 w-4 text-muted-foreground" aria-hidden />{CHECKS[c.id].label}</li>
            ))}
          </ul>
        )}
      </section>}

      <h2 className="text-lg font-semibold mt-12">Audit the checks behind the score</h2>
      <p className="text-meta text-muted-foreground mt-1">Every check, what we read and where.</p>
      <section className="mt-5" aria-labelledby="t-h">
        <div className="flex items-baseline justify-between gap-3 mb-3"><h3 id="t-h" className="font-semibold">Transparency</h3>{partTotal("transparency", t)}</div>
        <Accordion groups={t} date={score.checked_at} pageUrl={score.page_url} scored={scored} />
      </section>
      <section className="mt-8" aria-labelledby="v-h">
        <div className="flex items-baseline justify-between gap-3 mb-3"><h3 id="v-h" className="font-semibold">Partner value</h3>{partTotal("partner_value", v)}</div>
        <Accordion groups={v} date={score.checked_at} pageUrl={score.page_url} scored={scored} />
      </section>

      {machine.length > 0 && (
        <section className="mt-12" aria-labelledby="machine-h">
          <h2 id="machine-h" className="text-lg font-semibold">Machine checks · not counted in OAS</h2>
          <p className="text-meta text-muted-foreground mt-1">
            Read automatically from public data, measured {machine[0].measuredAt}. They inform the next OAS version and do not change this score.
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {machine.map((c) => (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-3">
                <span className="font-medium">{c.label}</span>
                <span className={`font-mono text-sm ${c.met ? "text-good" : "text-muted-foreground"}`}>{c.met ? "Met" : "Not met"}</span>
                <span className="col-span-2 text-sm text-muted-foreground">{c.reading}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 border-t border-border pt-6 text-meta text-muted-foreground max-w-3xl">
        <p>
          OAS reads only the terms verified on the program&rsquo;s own page: Transparency (70) and Partner value (30), never the commission size. {TEAM_DISCLOSURE} Found a mistake? <a href={errorUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">Report an error</a>.
        </p>
      </div>
    </div>
  );
}
