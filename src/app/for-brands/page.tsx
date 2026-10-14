import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AffitorLink } from "@/components/affitor-link";
import { FOR_BRANDS, affitorUrl } from "@/lib/affitor-link";

export const metadata: Metadata = {
  title: FOR_BRANDS.title,
  description: FOR_BRANDS.description,
  alternates: { canonical: "/for-brands" },
};

export default function ForBrandsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold tracking-tight">{FOR_BRANDS.h1}</h1>
      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{FOR_BRANDS.body}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link
          href="/submit"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-5 py-2.5 text-sm font-medium hover:bg-foreground/90 transition-colors"
        >
          {FOR_BRANDS.submit}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <AffitorLink
          href={affitorUrl("for_brands", "for_brands")}
          source="for_brands"
          cta="run"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border/60 px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          {FOR_BRANDS.affitor}
        </AffitorLink>
      </div>
    </div>
  );
}
