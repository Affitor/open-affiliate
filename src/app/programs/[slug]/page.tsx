import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Star,
  Clock,
  DollarSign,
  Copy,
  Terminal,
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProgramLogo } from "@/components/program-logo";
import { programs, getProgram } from "@/lib/programs";

export function generateStaticParams() {
  return programs.map((p) => ({ slug: p.slug }));
}

function BoolIcon({ value }: { value?: boolean }) {
  if (value === true)
    return <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
  if (value === false)
    return <X className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;
  return <span className="text-xs text-muted-foreground">—</span>;
}

export default async function ProgramPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = getProgram(slug);
  if (!program) notFound();

  const joinUrl = program.signupUrl ?? program.url;

  const approvalConfig = {
    auto: {
      label: "Automatic",
      icon: <Check className="h-3.5 w-3.5 text-emerald-600" />,
      className: "text-emerald-600",
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Breadcrumb */}
      <Link
        href="/programs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Programs
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Header */}
          <div className="flex items-start gap-4">
            <ProgramLogo slug={program.slug} name={program.name} size={56} className="shrink-0 rounded-xl" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                  {program.name}
                </h1>
                {program.verified && (
                  <Badge
                    variant="outline"
                    className="text-xs border-emerald-600/30 text-emerald-600 shrink-0"
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {program.shortDescription}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
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

          {/* Description */}
          <div>
            <h2 className="text-base font-semibold mb-3">About</h2>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {program.description}
            </div>
          </div>

          {/* How to Join */}
          {(program.signupUrl ?? program.approval ?? program.approvalTime) && (
            <div>
              <h2 className="text-base font-semibold mb-3">How to Join</h2>
              <div className="rounded-xl border border-border/50 bg-card/30 p-5 space-y-4">
                {program.signupUrl && (
                  <a
                    href={program.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
                  >
                    Apply to program
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
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
          {program.restrictions && program.restrictions.length > 0 && (
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
              {program.agentKeywords && program.agentKeywords.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Keywords:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {program.agentKeywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="text-[11px]">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">Keywords:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {program.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px]">
                        {tag}
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

          {/* Install */}
          <div>
            <h2 className="text-base font-semibold mb-3">Quick install</h2>
            <div className="rounded-lg bg-muted/50 border border-border/50 p-4 flex items-center justify-between gap-3 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
                <Terminal className="h-4 w-4 text-muted-foreground shrink-0" />
                <code className="text-sm font-mono text-emerald-700 whitespace-nowrap">
                  npx openaffiliate add {program.slug}
                </code>
              </div>
              <button className="p-1.5 hover:bg-muted rounded transition-colors shrink-0">
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
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
                  href={`https://github.com/openaffiliate/registry/blob/main/programs/${program.slug}.yaml`}
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
          <div className="glow-card rounded-xl border border-border/50 bg-card/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold">Commission</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Rate
                </span>
                <span className="text-sm font-semibold">
                  {program.commission.rate}%{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    {program.commission.type}
                  </span>
                </span>
              </div>

              {program.commissionDuration && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> Duration
                    </span>
                    <span className="text-sm font-semibold">
                      {program.commissionDuration}
                    </span>
                  </div>
                </>
              )}

              {program.commissionConditions && (
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed border-t border-border/30 pt-2">
                  {program.commissionConditions}
                </p>
              )}

              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> Cookie
                </span>
                <span className="text-sm font-semibold">
                  {program.cookieDays} days
                </span>
              </div>

              {program.attribution && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <MousePointer className="h-3 w-3" /> Attribution
                    </span>
                    <span className="text-sm font-semibold capitalize">
                      {program.attribution}
                    </span>
                  </div>
                </>
              )}

              {program.trackingMethod && (
                <>
                  <div className="h-px bg-border/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Fingerprint className="h-3 w-3" /> Tracking
                    </span>
                    <span className="text-sm font-semibold capitalize">
                      {program.trackingMethod}
                    </span>
                  </div>
                </>
              )}

              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="h-3 w-3" /> Min payout
                </span>
                <span className="text-sm font-semibold">
                  ${program.payout.minimum}
                </span>
              </div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> Frequency
                </span>
                <span className="text-sm font-semibold capitalize">
                  {program.payout.frequency}
                </span>
              </div>

              {program.payoutMethods && program.payoutMethods.length > 0 && (
                <>
                  <div className="h-px bg-border/50" />
                  <div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                      <CreditCard className="h-3 w-3" /> Payment methods
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {program.payoutMethods.map((method) => (
                        <Badge
                          key={method}
                          variant="outline"
                          className="text-[10px] capitalize"
                        >
                          {method}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Program Info card */}
          {(program.network !== undefined ||
            program.programAge ||
            program.marketingMaterials !== undefined ||
            program.apiAvailable !== undefined ||
            program.dedicatedManager !== undefined) && (
            <div className="glow-card rounded-xl border border-border/50 bg-card/50 p-5">
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
                      {program.network ?? "In-house"}
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

          {/* Category */}
          <div className="glow-card rounded-xl border border-border/50 bg-card/50 p-5">
            <h3 className="text-sm font-semibold mb-3">Category</h3>
            <Badge variant="secondary">{program.category}</Badge>
          </div>

          {/* Tags */}
          <div className="glow-card rounded-xl border border-border/50 bg-card/50 p-5">
            <h3 className="text-sm font-semibold mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {program.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Submitted by */}
          <div className="glow-card rounded-xl border border-border/50 bg-card/50 p-5">
            <h3 className="text-sm font-semibold mb-2">Submitted by</h3>
            <p className="text-xs text-muted-foreground">
              @{program.submittedBy}
            </p>
          </div>

          {/* Join */}
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground hover:bg-foreground/90 text-background px-5 py-3 text-sm font-medium transition-colors w-full"
          >
            Join Program
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
