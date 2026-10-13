import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  DollarSign,
  Bot,
  GitFork,
  Shield,
  Calendar,
  Check,
  X,
  Lock,
  MousePointer,
  Fingerprint,
  CreditCard,
  Info,
  Network,
  Users,
  BarChart2,
  Zap,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { CopyButton } from "@/components/copy-button";
import { VoteButton } from "@/components/vote-button";
import { ConnectTabs } from "@/components/connect-tabs";
import { CapabilityCards } from "@/components/capability-cards";
import { RelatedPrograms } from "@/components/related-programs";
import { SocialListenLoader } from "@/components/social-listen-loader";
import { ClaimChip } from "@/components/claim-chip";
import { serializeJsonLd } from "@/lib/json-ld";
import { seoTitle, seoDescription, buildFaq, programJsonLd, isDiscontinued, isPaused, isUnverified, networkName } from "@/lib/program-seo";
import { programs, livePrograms, getProgram, parseCommissionRate, commissionLabel, affiliateScore, IN_HOUSE, commissionDisplay, networkName as networkLabel, confirmedTerms, termsConfirmed, UNCONFIRMED_NOTE } from "@/lib/programs";
import { applyButton } from "@/lib/apply-cta";
import { hasNoProgram, noProgramAlternatives, noProgramHeadline } from "@/lib/no-program";
import { TrackView, TrackLink } from "./track-view";

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

function BoolIcon({ value }: { value?: boolean }) {
  if (value === true)
    return <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />;
  if (value === false)
    return <X className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;
  return <span className="text-xs text-muted-foreground">—</span>;
}

function StatBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}

function SidebarRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
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

  const faq = buildFaq(program);
  const discontinued = isDiscontinued(program);
  // Closed or never run: the page answers "no" and shows no terms.
  const noProgram = hasNoProgram(program);
  const hasAlternatives = noProgram && noProgramAlternatives(program).length > 0;
  const paused = isPaused(program);
  const unverified = isUnverified(program);
  const network = networkName(program);
  const applyCta = applyButton(program);
  // Unverified: the commission badge says it is not confirmed.
  const unconfirmed = unverified ? " (unconfirmed)" : "";
  const confirmed = termsConfirmed(program);
  const cookieText =
    program.cookieDays == null ? "Cookie not published" : program.cookieDays === 0 ? "Code-based, no cookie" : `${program.cookieDays}d cookie`;
  const trustLine = noProgram
    ? `Status checked${program.lastVerifiedAt ? ` ${program.lastVerifiedAt}` : ""}`
    : paused
      ? `${program.createdAt ? `Listed ${program.createdAt} · ` : ""}Last known terms, not confirmed`
      : program.verified
        ? `Terms checked${program.lastVerifiedAt ? ` ${program.lastVerifiedAt}` : ""}${network ? ` · runs on ${network}` : ""}`
        : `Community-submitted, not verified.${network && program.network !== IN_HOUSE ? ` This program may run on ${network} without a public page;` : ""} ${network && program.network !== IN_HOUSE ? "check" : "Check"} the brand's terms before promoting.`;

  // Mockup states: one tag next to the H1; "Verified" only on a live, checked program.
  const statusTag = discontinued ? "Discontinued" : noProgram ? "No affiliate program" : paused ? "Status unclear" : unverified ? "Not verified" : null;
  const pausedNote = program.statusNote
    ? `${program.statusNote.replace(/\.?$/, ".")}`
    : "The signup page is not working right now.";

  // Affiliate Score
  const score = affiliateScore(stored);
  // Compared with live programs only: a brand with no program has no score to average.
  const categoryPrograms = livePrograms.filter((p) => p.category === program.category);
  // A program with no cookie_days scores NaN; one such entry turned every
  // category average into "NaN vs avg".
  const categoryScores = categoryPrograms.map(affiliateScore).filter(Number.isFinite);
  const categoryAvg = Math.round(
    categoryScores.reduce((sum, v) => sum + v, 0) / Math.max(categoryScores.length, 1)
  );
  const scoreDiff = score - categoryAvg;

  const approvalConfig = {
    auto: {
      label: "Automatic",
      icon: <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />,
      className: "text-emerald-600 dark:text-emerald-400",
    },
    manual: {
      label: "Manual review",
      icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
      className: "text-foreground",
    },
    "invite-only": {
      label: "Invite only",
      icon: <Lock className="h-3.5 w-3.5 text-muted-foreground" />,
      className: "text-foreground",
    },
  } as const;

  const approvalKey = program.approval as keyof typeof approvalConfig | undefined;
  const approvalInfo = approvalKey ? approvalConfig[approvalKey] : null;

  const mcpHttp = `{
  "mcpServers": {
    "openaffiliate": {
      "url": "https://openaffiliate.dev/mcp"
    }
  }
}`;

  const mcpStdio = `{
  "mcpServers": {
    "openaffiliate": {
      "command": "npx",
      "args": ["-y", "openaffiliate-mcp"]
    }
  }
}`;

  const badgeMarkdown = `[![OpenAffiliate](https://openaffiliate.dev/badge/${program.slug}.svg)](https://openaffiliate.dev/programs/${program.slug})`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
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
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Programs
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <ProgramLogo slug={program.slug} name={program.name} size={56} className="shrink-0 rounded-xl" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {program.name} Affiliate Program
            </h1>
            {program.verified && !statusTag && (
              <Badge
                variant="outline"
                className="text-xs border-emerald-600/30 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0"
              >
                <Shield className="h-3 w-3 mr-1" />
                Verified
              </Badge>
            )}
            {statusTag && (
              <Badge
                variant="outline"
                className={`text-xs shrink-0 ${unverified ? "text-muted-foreground" : "border-amber-500/40 text-amber-700 dark:text-amber-400"}`}
              >
                {statusTag}
              </Badge>
            )}
            <ClaimChip program={program} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {program.shortDescription}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">{trustLine}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
            <a
              href={program.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span className="truncate max-w-[180px] sm:max-w-none">{program.url.replace("https://", "")}</span>
            </a>
            <span className="text-border hidden sm:inline">|</span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {program.createdAt}
            </div>
          </div>
        </div>
      </div>

      {/* Stat badges row */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {!noProgram && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Score: {score}
          <span className={`text-[10px] font-normal ${scoreDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
            ({scoreDiff >= 0 ? "+" : ""}{scoreDiff} vs avg)
          </span>
        </div>
        )}
        {!noProgram && (<>
        <StatBadge
          icon={<DollarSign className="h-3 w-3" />}
          label={`${commissionDisplay(program.commission)} ${commissionLabel(program.commission)}${unconfirmed}`}
        />
        {confirmed && (
          <StatBadge
            icon={<Clock className="h-3 w-3" />}
            label={`${cookieText}${program.cookieDays == null ? "" : unconfirmed}`}
          />
        )}
        {program.network && (
          <StatBadge
            icon={<Network className="h-3 w-3" />}
            label={networkLabel(program.network)}
          />
        )}
        {approvalInfo && (
          <StatBadge
            icon={<Zap className="h-3 w-3" />}
            label={approvalInfo.label}
          />
        )}
        </>)}
        <StatBadge
          icon={<Globe className="h-3 w-3" />}
          label={program.category}
        />
        <div className="ml-auto">
          <VoteButton slug={program.slug} initialCount={0} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {paused && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
              <p className="text-sm">
                {pausedNote} The program may have closed or moved. Last known terms are shown for reference.
              </p>
              <a href="#alternatives" className="mt-3 inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                See alternatives
              </a>
            </div>
          )}
          {noProgram && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
              <h2 className="text-base font-semibold mb-1">{noProgramHeadline(program)}</h2>
              <p className="text-sm text-muted-foreground">
                {program.statusNote ? program.statusNote.trim().replace(/\.?$/, ".") : "The program no longer accepts affiliates."}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {program.lastVerifiedAt ? `Checked ${program.lastVerifiedAt}.` : ""}
                {hasAlternatives ? " The programs below pay commission for similar products." : ""}
              </p>
              {hasAlternatives && (
                <a href="#alternatives" className="mt-3 inline-flex rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted/50 transition-colors">
                  See alternatives
                </a>
              )}
            </div>
          )}

          {/* About */}
          <div>
            <h2 className="text-base font-semibold mb-3">About</h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {program.description}
            </div>
          </div>

          {/* Social Listen */}
          <Suspense fallback={<div className="animate-pulse h-48 rounded-xl bg-muted/30" />}>
            <SocialListenLoader slug={slug} />
          </Suspense>

          {/* How to Join */}
          {!noProgram && !paused && (program.signupUrl ?? program.approval ?? program.approvalTime) && (
            <div>
              <h2 className="text-base font-semibold mb-3">How to Join</h2>
              <div className="rounded-xl border border-border/50 bg-card/30 p-5 space-y-4">
                {program.signupUrl && (
                  <TrackLink
                    href={applyCta.href}
                    slug={slug}
                    className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
                  >
                    {applyCta.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </TrackLink>
                )}
                <div className="flex flex-wrap gap-6">
                  {approvalInfo && (
                    <div className="flex items-center gap-2">
                      {approvalInfo.icon}
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Approval
                        </p>
                        <p className={`text-sm font-medium ${approvalInfo.className}`}>
                          {approvalInfo.label}
                        </p>
                      </div>
                    </div>
                  )}
                  {program.approvalTime && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          Approval time
                        </p>
                        <p className="text-sm font-medium">{program.approvalTime}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Restrictions */}
          {!noProgram && program.restrictions && program.restrictions.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3">Restrictions</h2>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-5">
                <ul className="space-y-2">
                  {program.restrictions.map((restriction, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                      {restriction}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* FAQ: answered only from the fields above; mirrors the FAQPage JSON-LD */}
          {faq.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3">{program.name} affiliate program FAQ</h2>
              <dl className="space-y-4">
                {faq.map((f) => (
                  <div key={f.q}>
                    <dt className="text-sm font-medium">{f.q}</dt>
                    <dd className="text-sm text-muted-foreground mt-1">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Agent Instructions */}
          <div className="gradient-border rounded-xl border border-border/50 bg-card/30 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border/30 bg-muted/30">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">AGENTS.md</h2>
              <Badge variant="outline" className="text-[10px] ml-auto">
                For AI Agents
              </Badge>
            </div>
            <div className="p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {program.agentPrompt}
              </p>

              {/* Agent keywords */}
              {(program.agentKeywords?.length || program.tags.length > 0) && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Keywords:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(program.agentKeywords?.length ? program.agentKeywords : program.tags).map((kw) => (
                      <Badge key={kw} variant="secondary" className="text-[11px]">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Agent use cases */}
              {program.agentUseCases && program.agentUseCases.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Use cases:</p>
                  <ul className="space-y-1">
                    {program.agentUseCases.map((uc, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                        {uc}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Related Programs */}
          <div id="alternatives" className="scroll-mt-20">
            <RelatedPrograms current={program} title={noProgram || paused ? `${program.name} affiliate program alternatives` : undefined} />
          </div>

          {/* Brand-side CTA. Button text is the approved affitor.com CTA (2026-10-02 audit): at most 4 words, no dash. */}
          <div className="rounded-xl border border-border/50 bg-card/30 p-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Run a SaaS?</span> Start your own affiliate program on Affitor. Free until your first $10k in affiliate revenue.
            </p>
            <a
              href={`https://affitor.com/?utm_source=openaffiliate&utm_medium=program_page&utm_campaign=${program.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Launch your program free
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Contribute */}
          <div className="rounded-xl border border-border/40 bg-muted/10 p-5 flex items-start gap-3">
            <GitFork className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold">
                Improve this listing
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                This program is community-maintained. Found outdated info?{" "}
                <a
                  href={`https://github.com/Affitor/open-affiliate/blob/main/programs/${program.slug}.yaml`}
                  className="text-foreground hover:underline"
                >
                  Edit on GitHub
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Commission card */}
          {!noProgram && (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5 space-y-3">
            <h3 className="text-sm font-semibold">Commission</h3>

            <SidebarRow
              label="Rate"
              icon={<DollarSign className="h-3 w-3" />}
              value={<>{commissionDisplay(program.commission)} <span className="text-xs text-muted-foreground font-normal">{commissionLabel(program.commission)}</span></>}
            />
            {!confirmed && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">{UNCONFIRMED_NOTE}</p>
            )}

            {program.commissionDuration && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Duration" icon={<Calendar className="h-3 w-3" />} value={program.commissionDuration} />
              </>
            )}

            {program.commissionConditions && (
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed border-t border-border/30 pt-2">
                {program.commissionConditions}
              </p>
            )}

            {confirmed && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Cookie" icon={<Clock className="h-3 w-3" />} value={program.cookieDays == null ? "Not published" : program.cookieDays === 0 ? "None (code-based)" : `${program.cookieDays} days`} />
              </>
            )}

            {program.attribution && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Attribution" icon={<MousePointer className="h-3 w-3" />} value={<span className="capitalize">{program.attribution}</span>} />
              </>
            )}

            {program.trackingMethod && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Tracking" icon={<Fingerprint className="h-3 w-3" />} value={<span className="capitalize">{program.trackingMethod}</span>} />
              </>
            )}

            {program.payout.minimum != null && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Min payout" icon={<DollarSign className="h-3 w-3" />} value={`$${program.payout.minimum}`} />
              </>
            )}
            {program.payout.frequency && (
              <>
                <div className="h-px bg-border/50" />
                <SidebarRow label="Frequency" icon={<Calendar className="h-3 w-3" />} value={<span className="capitalize">{program.payout.frequency}</span>} />
              </>
            )}

            {program.payoutMethods && program.payoutMethods.length > 0 && (
              <>
                <div className="h-px bg-border/50" />
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                    <CreditCard className="h-3 w-3" /> Payment methods
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {program.payoutMethods.map((method) => (
                      <Badge key={method} variant="outline" className="text-[10px] capitalize">
                        {method}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          )}

          {/* Program Info card */}
          {!noProgram && (program.network !== undefined ||
            program.programAge ||
            program.marketingMaterials !== undefined ||
            program.apiAvailable !== undefined ||
            program.dedicatedManager !== undefined) && (
            <div className="rounded-xl border border-border/50 bg-card/50 p-5">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                Program Info
              </h3>
              <div className="space-y-2.5">
                {program.network !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Network className="h-3 w-3" /> Network
                    </span>
                    <span className="text-xs font-medium">
                      {networkLabel(program.network ?? IN_HOUSE)}
                    </span>
                  </div>
                )}
                {program.programAge && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <BarChart2 className="h-3 w-3" /> Program age
                    </span>
                    <span className="text-xs font-medium">{program.programAge}</span>
                  </div>
                )}
                {program.marketingMaterials !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Marketing materials</span>
                    <BoolIcon value={program.marketingMaterials} />
                  </div>
                )}
                {program.apiAvailable !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">API available</span>
                    <BoolIcon value={program.apiAvailable} />
                  </div>
                )}
                {program.dedicatedManager !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Dedicated manager
                    </span>
                    <BoolIcon value={program.dedicatedManager} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Capabilities */}
          <CapabilityCards
            tools={[
              { title: "search_programs", description: "Search by keyword, category, commission type" },
              { title: "get_program", description: "Full details including agent instructions" },
              { title: "list_categories", description: "All categories with program counts" },
            ]}
            resources={[
              { title: "REST API", description: `GET /api/programs/${program.slug}` },
              { title: "MCP Server", description: "HTTP and stdio transports" },
              ...(program.dashboardUrl ? [{ title: "Dashboard", description: program.dashboardUrl }] : []),
            ]}
            useCases={
              program.agentUseCases?.map((uc) => ({ title: uc })) ?? []
            }
          />

          {/* Connect — tabbed code snippets */}
          <ConnectTabs slug={program.slug} mcpHttp={mcpHttp} mcpStdio={mcpStdio} />

          {/* Badge embed */}
          {!noProgram && (
          <div className="rounded-xl border border-border/50 bg-card/50 p-5">
            <h3 className="text-sm font-semibold mb-3">Badge</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/badge/${program.slug}.svg`} alt={`${program.name} on OpenAffiliate`} className="mb-3" />
            <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2 flex items-center justify-between gap-2">
              <code className="text-[10px] font-mono text-muted-foreground truncate">Markdown</code>
              <CopyButton text={badgeMarkdown} />
            </div>
          </div>
          )}

          {/* Tags */}
          {program.tags.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-card/50 p-5">
              <h3 className="text-sm font-semibold mb-3">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {program.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Join button */}
          {!noProgram && !paused && <TrackLink
            href={applyCta.href}
            slug={slug}
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground hover:bg-foreground/90 text-background px-5 py-3 text-sm font-medium transition-colors w-full"
          >
            {applyCta.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </TrackLink>}
        </div>
      </div>
    </div>
  );
}
