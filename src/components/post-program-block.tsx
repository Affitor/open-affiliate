import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { PostApplyLink } from "@/components/post-apply-link";
import { networkName, IN_HOUSE, type Program } from "@/lib/programs";
import { applyButton, blogApplyHref } from "@/lib/apply-cta";
import { checkedText, cookieText, earnText, payoutText, type PostProgram } from "@/lib/best-posts";

/** One program in a post or guide: why it fits, its terms from the registry, and the blog Apply link for `campaign`. */
export function PostProgramBlock({ program, copy, index, campaign }: { program: Program; copy: PostProgram; index: number; campaign: string }) {
  return (
    <section id={program.slug} data-post-program={program.slug} className="scroll-mt-20 border-t border-border py-8 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-3">
        <span className="font-mono text-meta text-muted-foreground">{index + 1}</span>
        <ProgramLogo slug={program.slug} name={program.name} size={40} className="shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">{program.name}</h2>
          <p className="text-sm text-muted-foreground">{copy.bestFor}</p>
        </div>
      </div>
      <p className="text-base leading-relaxed text-foreground/80 mt-4">{copy.why}</p>
      {copy.notFor && <p className="text-sm text-muted-foreground mt-2"><span className="font-medium text-foreground">Not for:</span> {copy.notFor}</p>}
      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4">
        {[
          ["You earn", earnText(program)],
          ["Cookie", cookieText(program)],
          ["Payout", payoutText(program)],
          ["Runs on", program.network && program.network !== IN_HOUSE ? networkName(program.network) : "Its own program"],
        ].map(([dt, dd]) => (
          <div key={dt} className="border-border px-3 py-2.5 [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0 even:border-l sm:border-l sm:first:border-l-0">
            <dt className="oa-label">{dt}</dt>
            <dd className="mt-1 text-sm">{dd}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href={`/programs/${program.slug}`} className="underline underline-offset-4 decoration-border hover:decoration-foreground">Full terms</Link>
        <PostApplyLink
          href={blogApplyHref(program, campaign)}
          slug={program.slug}
          post={campaign}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-meta font-medium text-primary-foreground hover:bg-primary/90"
        >
          {applyButton(program, "blog").label}
          <ExternalLink className="size-3" aria-hidden />
        </PostApplyLink>
        <span className="text-meta text-muted-foreground">Terms checked {checkedText(program)}</span>
      </div>
    </section>
  );
}
