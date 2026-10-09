import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { changelog } from "@/lib/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description: "What's new in OpenAffiliate. New features, improvements, and fixes.",
  alternates: {
    canonical: "/changelog",
    types: {
      "text/markdown": "https://openaffiliate.dev/changelog.md",
    },
  },
};

const TAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", label: "New" },
  improved: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", label: "Improved" },
  fixed: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", label: "Fixed" },
};

function TagBadge({ tag }: { tag: string }) {
  const style = TAG_STYLES[tag] ?? TAG_STYLES.new;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-16">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block">
          &larr; Back to OpenAffiliate
        </Link>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-2">Changelog</h1>
        <p className="text-lg text-muted-foreground mt-3">
          New features, improvements, and fixes shipped to OpenAffiliate.
        </p>
      </header>

      <div className="space-y-0">
        {changelog.map((entry, i) => (
          <article key={entry.date} className="relative pl-8 pb-16 last:pb-0">
            {/* Timeline line */}
            {i < changelog.length - 1 && (
              <div className="absolute left-[7px] top-[28px] bottom-0 w-px bg-border" />
            )}
            {/* Timeline dot */}
            <div className="absolute left-0 top-[6px] w-[15px] h-[15px] rounded-full border-2 border-emerald-500 bg-background" />

            <time className="text-sm font-medium text-muted-foreground">{entry.date}</time>
            <h2 className="text-xl font-semibold mt-1 mb-6">{entry.title}</h2>

            {entry.image && (
              <div className="mb-8 rounded-xl overflow-hidden border border-border/60 shadow-sm">
                <Image
                  src={entry.image.src}
                  alt={entry.image.alt}
                  width={1280}
                  height={900}
                  className="w-full h-auto"
                  priority={i === 0}
                />
              </div>
            )}

            <ul className="space-y-3">
              {entry.items.map((item, j) => (
                <li key={j} className="flex gap-3 items-start">
                  <TagBadge tag={item.tag} />
                  <span className="text-sm text-muted-foreground leading-relaxed">{item.text}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
