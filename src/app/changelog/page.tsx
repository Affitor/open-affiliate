import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { changelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What changed in OpenAffiliate: new features, corrected terms and fixes, as they go live.",
  alternates: {
    canonical: "/changelog",
    types: {
      "text/markdown": "https://openaffiliate.dev/changelog.md",
    },
  },
};

const TAG_LABEL = { new: "New", improved: "Improved", fixed: "Fixed" } as const;
const KIND_LABEL = { feature: "Feature", improvements: "Improvements" } as const;

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export default function ChangelogPage() {
  return (
    <div className="oa-frame">
      <header className="oa-band pt-14 pb-8">
        <p className="oa-label">Changelog</p>
        <h1 className="text-title md:text-display font-semibold tracking-[-0.03em] mt-2">What changed in OpenAffiliate</h1>
        <p className="text-lg text-muted-foreground mt-2">New programs, corrected terms and new features, as they go live. OpenAffiliate launched on <time dateTime="2026-04-17">April 17, 2026</time>.</p>
      </header>

      <section className="oa-band">
        {changelog.map((entry, i) => (
          <article
            key={`${entry.date}-${entry.title}`}
            id={entry.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}
            className="grid gap-3 py-12 first:pt-2 border-t border-border first:border-t-0 md:grid-cols-[200px_minmax(0,680px)] md:gap-12"
          >
            <div className="md:sticky md:top-20 md:self-start flex flex-wrap items-center gap-2 md:block">
              <time dateTime={entry.date} className="font-mono text-meta font-medium">{formatDate(entry.date)}</time>
              <p className="md:mt-2">
                <span className="inline-flex h-[22px] items-center rounded-sm border border-line-strong px-2 text-xs text-muted-foreground">{KIND_LABEL[entry.kind]}</span>
              </p>
            </div>
            <div>
              <h2 className="text-title font-semibold tracking-tight">{entry.title}</h2>
              {entry.summary && <p className="text-base leading-relaxed text-foreground/80 mt-3">{entry.summary}</p>}
              {entry.image && (
                <div className="mt-5 overflow-hidden rounded-xl border border-border">
                  <Image src={entry.image.src} alt={entry.image.alt} width={1280} height={900} className="h-auto w-full" priority={i === 0} />
                </div>
              )}
              <ul className="mt-4 grid gap-3">
                {entry.items.map((item) => (
                  <li key={item.text} className="grid grid-cols-[76px_minmax(0,1fr)] gap-3 text-base leading-relaxed text-foreground/80">
                    <span className="oa-label pt-1">{TAG_LABEL[item.tag]}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              {entry.link && (
                <Link href={entry.link.href} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4 decoration-border hover:decoration-foreground">
                  {entry.link.label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
