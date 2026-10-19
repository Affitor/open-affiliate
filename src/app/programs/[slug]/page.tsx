import { SaveButton } from "@/components/save-button";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Info,
  MousePointerClick,
  ShieldCheck,
  UserCheck,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { ProgramCompare, getRelatedPrograms } from "@/components/related-programs";
import { ClaimChip } from "@/components/claim-chip";
import { EarningsCalculator } from "@/components/earnings-calculator";
import { serializeJsonLd } from "@/lib/json-ld";
import { seoTitle, seoDescription, buildFaq, programJsonLd, networkName } from "@/lib/program-seo";
import { programs, getProgram, affiliateScore, IN_HOUSE, categoryToSlug, confirmedTerms, networkHowToJoin, UNCONFIRMED_NOTE } from "@/lib/programs";
import { alsoOnAffitor, applyButton } from "@/lib/apply-cta";
import { outboundUrl } from "@/lib/outbound-link";
import { noProgramHeadline } from "@/lib/no-program";
import { AFFITOR_SAME_TEAM, SAME_TEAM, isSameTeam } from "@/lib/same-team";
import {
  answerParts,
  approvalText,
  APPROVAL_WORDS,
  commissionFigure,
  cookieText,
  estimateInput,
  figureText,
  joinThrough,
  pageState,
  payoutMethods,
  payoutText,
  productText,
  programUseCases,
} from "@/lib/program-page";
import { claimsEnabledFor } from "@/lib/claims/rules";
import { TrackView, TrackLink } from "./track-view";
import { AffitorLink } from "@/components/affitor-link";
import { AFFITOR_SWITCH, FOR_BRANDS, affitorUrl } from "@/lib/affitor-link";
import { getOasScore, oasValue } from "@/lib/oas";

export const revalidate = 86400;
export const dynamicParams = true;

export function generateStaticParams() {
  const top = [...programs]
    .sort((a, b) => affiliateScore(b) - affiliateScore(a))
    .slice(0, 50);
  return top.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) return { title: "Program Not Found" };

  const title = seoTitle(program);
  const description = seoDescription(program);

  return {
    title,
    description,
    // Points a machine reader at the markdown twin of this page, which carries
    // the agents: guidance in a form it can lift directly. Preferred over
    // putting .md URLs in the sitemap: those are alternate representations of
    // a page, not separate pages to index.
    // canonical must be repeated here: setting `alternates` at all replaces
    // the inherited object from the root layout, so declaring only `types`
    // silently dropped the canonical tag from every program page.
    alternates: {
      canonical: `/programs/${slug}`,
      types: {
        "text/markdown": `https://openaffiliate.dev/programs/${slug}.md`,
      },
    },
    openGraph: {
      title,
      description,
      url: `https://openaffiliate.dev/programs/${slug}`,
      siteName: "OpenAffiliate",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-12" → "Oct 12, 2026", without the server's locale. */
function readableDate(iso?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : (iso ?? "");
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight mb-4">
      {children}
    </h2>
  );
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stored = getProgram(slug);
  if (!stored) notFound();
  // What a reader may see: unverified, no cookie window, payout or approval,
  // and no sentence of free text stating them (confirmed-terms.ts). Only the
  // score reads the stored program.
  const program = confirmedTerms(stored);

  const state = pageState(program);
  const noProgram = state === "no-program";
  const paused = state === "paused";
  const verified = state === "verified";
  const unconfirmed = !noProgram && !verified;
  const figure = commissionFigure(program);
  const faq = buildFaq(program);
  const network = networkName(program);
  const applyCta = applyButton(program, "program_page");
  const visitHref = outboundUrl(program.url, "program_page", slug);
  // The brand on Affitor too: one line under its own terms, and a secondary button.
  const alsoOn = alsoOnAffitor(program);
  const claimable = !program.claimedBy && claimsEnabledFor(program);
  // Claim spec v4 §3: a program already on Affitor gets a chip instead of the offer line.
  const onAffitor = program.network === "affitor" || Boolean(alsoOn);
  // A brand running its program elsewhere can move it to Affitor; not one already there, nor our own.
  const canMoveToAffitor = !noProgram && !onAffitor && !isSameTeam(program.slug);
  const estimate = estimateInput(program);
  const answer = answerParts(program, noProgram ? noProgramHeadline(program) : "");
  const cases = programUseCases(program);
  const payout = payoutText(program);
  const methods = payoutMethods(program);
  const approval = approvalText(program);
  const cookie = cookieText(program);
  const hasAlternatives = getRelatedPrograms(program).length > 0;
  // OAS sits in the header, away from the owner box and its "Move this program to Affitor" link.
  const oas = getOasScore(slug);

  // Mockup states: one tag next to the H1; "Verified" only on a live, checked program.
  const statusTag = noProgram
    ? program.status === "discontinued" ? "Discontinued" : "No affiliate program"
    : paused ? "Status unclear" : verified ? null : "Not verified";
  const pausedNote = program.statusNote
    ? `${program.statusNote.replace(/\.?$/, ".")}`
    : "The signup page is not working right now.";

  // The earnings facts. Each row carries data-term, which the served-page checks read
  // (scripts/unconfirmed-checks.ts): an unverified program renders none of
  // cookie, payout, paid-by or approval, because confirmedTerms removed them.
  const facts: { term: string; label: string; value: React.ReactNode }[] = [];
  if (payout) facts.push({ term: "payout", label: "Payout", value: payout });
  if (methods.length) facts.push({ term: "paid-by", label: "Paid by", value: methods.join(", ") });
  if (approval) facts.push({ term: "approval", label: "Approval", value: approval });
  if (cookie) facts.push({ term: "cookie", label: "Cookie", value: cookie });
  if (!noProgram) facts.push({ term: "network", label: "Join through", value: joinThrough(program, network) });
  if (!noProgram && program.marketingMaterials === true) facts.push({ term: "marketing", label: "Marketing kit", value: "Provided" });

  // Step details that repeat a term carry data-term too, so the page check sees them (step-*).
  const flow: { icon: React.ReactNode; title: string; detail: string; term?: string }[] = noProgram || paused
    ? []
    : [
        {
          icon: <UserCheck className="h-4 w-4" />,
          title: "Apply",
          term: program.approval && APPROVAL_WORDS[program.approval] ? "step-approval" : undefined,
          detail: program.approval && APPROVAL_WORDS[program.approval]
            ? `${APPROVAL_WORDS[program.approval]} approval${program.network && program.network !== IN_HOUSE && network ? ` on ${network}` : ""}`
            : program.network && program.network !== IN_HOUSE && network ? `Through ${network}` : `On ${(program.signupUrl ?? program.url).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}`,
        },
        {
          icon: <MousePointerClick className="h-4 w-4" />,
          title: "Share your link",
          term: verified && program.cookieDays ? "step-cookie" : undefined,
          detail: verified && program.cookieDays ? `${program.cookieDays}-day cookie` : "Wherever your audience is",
        },
        {
          icon: <CreditCard className="h-4 w-4" />,
          title: "Your referral converts",
          detail: !figure ? "Commission not published" : !verified ? "Terms not confirmed yet" : figure.kind === "varies" ? "Rate varies, see the fine print" : `You earn ${figureText(figure)}`,
        },
        { icon: <Wallet className="h-4 w-4" />, title: "You get paid", term: payout ? "step-payout" : undefined, detail: payout ?? "Per the program's terms" },
      ];

  const panelLabel = noProgram ? "Affiliate program" : !figure ? "Commission" : verified ? "You earn" : paused ? "Last known terms" : "Submitted terms · unconfirmed";

  const trust = noProgram
    ? `Checked${program.lastVerifiedAt ? ` ${readableDate(program.lastVerifiedAt)}` : ""}`
    : paused
      ? "Status unclear · last known terms, not confirmed"
      : verified
        ? `Terms checked${program.lastVerifiedAt ? ` ${readableDate(program.lastVerifiedAt)}` : ""}${network && program.network !== IN_HOUSE ? ` · Runs on ${network}` : ""}`
        : "Community-submitted, not verified yet. Check the brand's terms before promoting.";

  const compareTitle = noProgram
    ? `Programs that pay for tools like ${program.name}`
    : paused
      ? `${program.name} affiliate program alternatives`
      : `How ${program.name} compares`;

  const applyClass = unconfirmed
    ? "flex items-center justify-center gap-2 rounded-lg border border-border px-4 h-11 text-sm font-medium hover:bg-muted/50 transition-colors w-full"
    : "flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-4 h-11 text-sm font-medium hover:bg-foreground/90 transition-colors w-full";

  return (
    <div className="oa-frame px-4 sm:px-12 pt-6 sm:pt-10 pb-12">
      <TrackView slug={slug} />

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(programJsonLd(program, faq)),
        }}
      />

      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1.5 text-meta text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/programs" prefetch={false} className="hover:text-foreground transition-colors">Programs</Link>
        <span>/</span>
        <Link href={`/categories/${categoryToSlug(program.category)}`} className="hover:text-foreground transition-colors">{program.category}</Link>
        <span>/</span>
        <span className="text-foreground/80">{program.name}</span>
      </nav>

      {/* Header: what the product is, then the one-line answer */}
      <div className="flex items-start gap-4 sm:gap-5 mt-5">
        <ProgramLogo slug={program.slug} name={program.name} size={64} className="shrink-0 rounded-[14px] border border-border bg-white" />
        <div className="min-w-0">
          <h1 className="text-title md:text-display font-semibold tracking-[-0.03em]">{program.name} affiliate program</h1>
          <p className="text-base sm:text-lg text-foreground/80 mt-1.5">{program.shortDescription}</p>
          {isSameTeam(program.slug) && <p className="text-sm text-muted-foreground mt-1.5">{SAME_TEAM}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {verified && (
              <Badge variant="outline" className="text-xs border-good-line bg-good-bg text-good shrink-0">
                <Check className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
            {statusTag && (
              <Badge
                variant="outline"
                className={`text-xs shrink-0 ${statusTag === "Not verified" ? "text-muted-foreground" : "border-line-strong bg-sunk text-foreground"}`}
              >
                {statusTag}
              </Badge>
            )}
            <ClaimChip program={program} />
            <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">{program.category}</Badge>
            {oas && (
              <Link href={`/programs/${slug}/oas`} className="inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted/50 transition-colors">
                {oasValue(oas) == null ? "OAS · scoring in progress" : <>OAS <span className="font-mono ml-1">{oasValue(oas)}</span></>}
              </Link>
            )}
          </div>
        </div>
      </div>
      <p className="text-base sm:text-lg mt-5 max-w-3xl">
        {answer.before}
        {answer.strong && <strong className="font-semibold">{answer.strong}</strong>}
        {answer.after}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-x-14 mt-8">
        {/* Earnings panel: first in the DOM, so keyboard and screen readers reach Apply early; the grid puts it on the right. */}
        <aside aria-labelledby="earn-heading" className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-20 self-start rounded-xl border border-border bg-card p-5 mb-10 lg:mb-0">
          {paused && (
            <div className="rounded-xl border border-line-strong bg-sunk p-4 text-sm mb-5">
              <p className="font-medium">When we last checked, the signup page did not work.</p>
              <p className="text-muted-foreground mt-1">{pausedNote} The program may have closed or moved; the last known terms below are for reference only.</p>
            </div>
          )}
          <h2 id="earn-heading" className="oa-label">{panelLabel}</h2>
          {(noProgram || paused) && <div className="mt-5"><SaveButton slug={program.slug} name={program.name} /></div>}
          {noProgram ? (
            <>
              <p className="text-display font-semibold tracking-tight mt-2">None</p>
              <p className="text-sm text-muted-foreground mt-1">{noProgramHeadline(program)}.</p>
              {hasAlternatives && (
                <a href="#alternatives" className="mt-5 flex items-center justify-center gap-2 rounded-lg bg-foreground text-background h-11 text-sm font-medium hover:bg-foreground/90 transition-colors">
                  See programs that pay <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </>
          ) : (
            <>
              {figure ? (
                <p className="mt-1.5">
                  <span className={`block tracking-[-0.03em] ${figure.kind === "number" ? "font-mono font-medium text-display" : "font-semibold text-title"}`}>{figure.big}</span>
                  {figure.rest && <span className="block text-muted-foreground mt-1">{figure.rest}</span>}
                </p>
              ) : (
                <p className="text-title font-semibold tracking-tight mt-1.5">Commission not published</p>
              )}
              {unconfirmed && <p className="text-xs text-muted-foreground leading-relaxed mt-3">{UNCONFIRMED_NOTE}</p>}
              {facts.length > 0 && (
                <dl className="mt-5 border-t border-border">
                  {facts.map((f) => (
                    <div key={f.term} data-term={f.term} className="flex justify-between gap-4 py-2.5 border-b border-border text-sm"><dt className="text-muted-foreground">{f.label}</dt><dd className="text-right font-medium">{f.value}</dd></div>
                  ))}
                </dl>
              )}
              {!paused && (
                <div className="mt-5 flex items-center gap-2">
                  <TrackLink href={applyCta.href} slug={slug} cta="apply" className={applyClass}>
                    {applyCta.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </TrackLink>
                  <SaveButton slug={program.slug} name={program.name} />
                </div>
              )}
              {paused && hasAlternatives && (
                <a href="#alternatives" className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-border h-11 text-sm font-medium hover:bg-muted/50 transition-colors">
                  See alternatives <ArrowRight className="h-4 w-4" />
                </a>
              )}
              {alsoOn && (
                <div className="mt-4 pt-4 border-t border-border grid gap-2">
                  <p className="text-xs text-muted-foreground">{alsoOn.line}</p>
                  <TrackLink
                    href={alsoOn.href}
                    slug={slug}
                    cta="also_on"
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-border h-10 text-sm font-medium hover:bg-muted/50 transition-colors"
                  >
                    {alsoOn.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </TrackLink>
                </div>
              )}
            </>
          )}
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground mt-4">
            {verified ? <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-good" /> : paused ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <span>
              {trust}
              {(verified || noProgram) && (
                <>
                  {" · "}
                  <Link href="/methodology" className="underline underline-offset-4 hover:text-foreground">How we check</Link>
                </>
              )}
            </span>
          </p>
        </aside>

        <div className="lg:col-start-1 lg:row-start-1 min-w-0 space-y-12">
          {noProgram && (
            <div>
              {program.statusNote && <p className="text-sm text-muted-foreground">{program.statusNote.trim().replace(/\.?$/, ".")}</p>}
              <div id="alternatives" className="mt-8 scroll-mt-20">
                <ProgramCompare current={program} title={compareTitle} />
              </div>
            </div>
          )}

          <section>
            <H2>What {program.name} does</H2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{productText(program)}</p>
            <p className="mt-3 text-sm">
              <a href={visitHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-foreground">
                Visit {program.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </p>
          </section>

          {!noProgram && cases.length > 0 && (
            <section>
              <H2>What people use it for</H2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cases.map((c, i) => (
                  <li key={i} className="flex gap-2.5 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-good" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {flow.length > 0 && (
            <section>
              <H2>From click to payout</H2>
              <ol className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-0">
                {flow.map((s, i) => (
                  <li key={s.title} className="relative flex sm:block gap-3 sm:pr-4">
                    {i < flow.length - 1 && <span aria-hidden className="hidden sm:block absolute top-[17px] left-[34px] right-0 h-px bg-border" />}
                    <span className="relative z-10 grid place-items-center h-[34px] w-[34px] shrink-0 rounded-full border border-border bg-card">{s.icon}</span>
                    <span className="block">
                      <span className="block text-sm font-medium sm:mt-3">{s.title}</span>
                      <span data-term={s.term} className="block text-sm text-muted-foreground">{s.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {/* When a commission becomes payable; confirmedTerms left it out of an unverified program. */}
              {program.payout.conditions && (
                <p data-term="payout-conditions" className="text-sm leading-relaxed text-foreground/80 mt-4">{program.payout.conditions}</p>
              )}
              {program.network && program.network !== IN_HOUSE && (
                <p className="text-xs text-muted-foreground mt-4">{networkHowToJoin(program.network)}</p>
              )}
            </section>
          )}

          {!noProgram && ((program.restrictions?.length ?? 0) > 0 || (verified && program.commissionConditions)) && (
            <section>
              <H2>Rules before you promote</H2>
              {/* The card keeps the figure, the facts and Apply; the long commission terms live here. */}
              {verified && program.commissionConditions && (
                <details className="group mb-4 rounded-xl border border-border bg-card">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-sunk [&::-webkit-details-marker]:hidden">
                    How the commission works
                    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p data-term="conditions" className="border-t border-border px-4 py-3 text-sm leading-relaxed text-foreground/80">{program.commissionConditions}</p>
                </details>
              )}
              {(program.restrictions?.length ?? 0) > 0 && <ul className="space-y-2.5">
                {(program.restrictions ?? []).map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>}
            </section>
          )}

          {estimate && (
            <section>
              <H2>Estimate what you could earn</H2>
              <EarningsCalculator input={estimate} />
            </section>
          )}

          {!noProgram && (
            <div id="alternatives" className="scroll-mt-20">
              <ProgramCompare current={program} title={compareTitle} />
            </div>
          )}

          {/* FAQ: answered only from the fields above; mirrors the FAQPage JSON-LD */}
          {faq.length > 0 && (
            <section>
              <H2>{program.name} affiliate program FAQ</H2>
              <div className="border-t border-border">
                {faq.map((f) => (
                  <details key={f.q} className="group border-b border-border py-3.5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      <span>{f.q}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="text-sm text-muted-foreground mt-2">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* Owner box: claim where the flow is on, otherwise an edit on GitHub; then the brand-side CTA. */}
          <section className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
              {program.claimedBy ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <ClaimChip program={program} />
                    {onAffitor && <Badge variant="outline" className="text-xs text-muted-foreground">Runs on Affitor</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{program.name}&apos;s team keeps this page up to date. Every change is reviewed before it goes live.</p>
                  {/* Claim spec v4 §7.2: a dispute goes to the manual review queue. */}
                  {claimsEnabledFor(program) && (
                    <Link href={`/programs/${program.slug}/claim#report`} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                      Report this page
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold">{noProgram ? `Is this your company?` : "Is this your program?"}</p>
                  {claimable ? (
                    <>
                      <p className="text-sm text-muted-foreground">Claim this page to keep your terms up to date and add more programs.</p>
                      {onAffitor ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">Runs on Affitor</Badge>
                      ) : (
                        <p className="text-sm text-muted-foreground">Works with the Affitor network.</p>
                      )}
                      <div className="flex flex-wrap items-center gap-4">
                        <Link href={`/programs/${program.slug}/claim`} className="inline-flex items-center rounded-lg border border-border h-9 px-3.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                          Claim this page
                        </Link>
                        <a href={`https://github.com/Affitor/open-affiliate/blob/main/programs/${program.slug}.yaml`} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                          Suggest an edit on GitHub
                        </a>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This listing is community-maintained. {noProgram ? "Started a program, or found something outdated?" : "Found outdated terms?"}{" "}
                      <a href={`https://github.com/Affitor/open-affiliate/blob/main/programs/${program.slug}.yaml`} className="text-foreground underline underline-offset-4">
                        Suggest an edit on GitHub
                      </a>
                    </p>
                  )}
                  {canMoveToAffitor && (
                    <div className="space-y-1.5 border-t border-border pt-3">
                      <AffitorLink
                        href={affitorUrl("migrate", program.slug, AFFITOR_SWITCH)}
                        source="migrate"
                        slug={program.slug}
                        cta="move"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border h-9 px-3.5 text-sm font-medium hover:bg-muted/50 transition-colors"
                      >
                        Move this program to Affitor
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </AffitorLink>
                      <p className="text-xs text-muted-foreground">{AFFITOR_SAME_TEAM}</p>
                    </div>
                  )}
                </>
              )}
            </div>
            {/* Brand-side CTA. Button text is the approved affitor.com CTA (2026-10-02 audit): at most 4 words, no dash. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Run a SaaS?</span> Start your own affiliate program on Affitor. Free until your first $10k in affiliate revenue.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/for-brands" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors">
                  {FOR_BRANDS.programPageLink}
                </Link>
                <AffitorLink
                  href={affitorUrl("program_page", program.slug)}
                  source="program_page"
                  slug={program.slug}
                  cta="brand"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  Launch your program free
                  <ExternalLink className="h-3.5 w-3.5" />
                </AffitorLink>
              </div>
            </div>
          </section>

          {/* The machine layer lives in the .md twin, the API and MCP; the page only points at them. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-dashed border-border pt-4 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            <span>For AI agents and developers:</span>
            <a href={`/programs/${program.slug}.md`} className="font-mono underline underline-offset-4 hover:text-foreground">/programs/{program.slug}.md</a>
            <a href={`/api/programs/${program.slug}`} className="font-mono underline underline-offset-4 hover:text-foreground">/api/programs/{program.slug}</a>
            <Link href="/docs/mcp" className="font-mono underline underline-offset-4 hover:text-foreground">MCP server</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
