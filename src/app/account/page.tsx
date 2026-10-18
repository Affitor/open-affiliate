import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { claimEnvReady } from "@/lib/claims/rules";
import { AccountFlow } from "./account-flow";

export const metadata: Metadata = {
  title: "Your account",
  description: "Sign in to manage your company's affiliate program listings on OpenAffiliate.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  // Same switch as the claim flow: hidden until every claim secret is set.
  if (!claimEnvReady()) notFound();
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <AccountFlow siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
    </div>
  );
}
