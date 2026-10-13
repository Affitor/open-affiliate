import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProgram } from "@/lib/programs";
import { PILOT_SLUGS, claimsEnabledFor, registrableDomain } from "@/lib/claims/rules";
import { ClaimFlow } from "./claim-flow";

// Pilot listings only; every other slug is a 404 without rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return [...PILOT_SLUGS].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const program = getProgram(slug);
  return {
    title: program ? `Claim the ${program.name} listing` : "Claim a listing",
    robots: { index: false, follow: false },
    alternates: { canonical: `/programs/${slug}` },
  };
}

export default async function ClaimPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const program = getProgram(slug);
  // Hidden unless the pilot includes it and every claim secret is set.
  if (!program || !claimsEnabledFor(program)) notFound();
  const domain = registrableDomain(program.url);
  if (!domain) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href={`/programs/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {program.name} Affiliate Program
      </Link>
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Is this your program?</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-6">
        Prove you run {domain} to update the {program.name} listing on OpenAffiliate. We send a 6-digit code to an
        address at {domain}, or you can add a DNS record instead.
      </p>
      <ClaimFlow
        slug={slug}
        name={program.name}
        domain={domain}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        initialTerms={{
          rate: String(program.commission.rate ?? ""),
          type: program.commission.type,
          duration: program.commission.duration ?? "",
          cookieDays: program.cookieDays == null ? "" : String(program.cookieDays),
          payoutMinimum: program.payout.minimum == null ? "" : String(program.payout.minimum),
          signupUrl: program.signupUrl ?? "",
          note: "",
        }}
      />
      <p className="text-xs text-muted-foreground mt-4">
        We keep your email address only to confirm you run this listing and to reach you about your edits.{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy
        </Link>
      </p>
    </div>
  );
}
