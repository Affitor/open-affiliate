import { programs, isLive, confirmedTerms, commissionDisplay, networkName, IN_HOUSE, type Program } from "@/lib/programs";
import { hasNoProgram, noProgramAnswer } from "@/lib/no-program";
import { applyButton } from "@/lib/apply-cta";
import { CompareView, type CompareProgram } from "./compare-view";

/**
 * What the compare table may show for each program, built here on the server.
 * The client view used to import the whole registry, which put every stored
 * cookie window, payout and approval into a browser chunk; this passes only
 * these fields, after confirmedTerms.
 */
function toCompare(stored: Program): CompareProgram {
  const p = confirmedTerms(stored);
  const base = { slug: p.slug, name: p.name, category: p.category, tags: p.tags, verified: p.verified };
  if (!isLive(p)) {
    return {
      ...base,
      live: false,
      notLiveNote: hasNoProgram(p)
        ? `Does ${p.name} have an affiliate program? ${noProgramAnswer(p)}`
        : `${p.name} affiliate program status is unclear. ${p.statusNote ? p.statusNote.trim().replace(/\.?$/, ".") : "The signup page is not working right now."}`,
      commission: "",
      commissionType: "",
      commissionDuration: null,
      network: "",
      applyHref: "",
    };
  }
  // A left-out term stays out of the payload instead of crossing as "$undefined".
  return withoutUndefined({
    ...base,
    live: true,
    commission: commissionDisplay(p.commission),
    commissionType: p.commission.type,
    commissionDuration: p.commissionDuration ?? null,
    cookieDays: p.cookieDays,
    attribution: p.attribution,
    trackingMethod: p.trackingMethod,
    payoutMinimum: p.payout.minimum,
    payoutFrequency: p.payout.frequency,
    approval: p.approval,
    approvalTime: p.approvalTime,
    network: networkName(p.network ?? IN_HOUSE),
    networkKey: p.network ?? IN_HOUSE,
    marketingMaterials: p.marketingMaterials,
    apiAvailable: p.apiAvailable,
    dedicatedManager: p.dedicatedManager,
    applyHref: applyButton(p, "compare").href,
  });
}

function withoutUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export default function ComparePage() {
  return <CompareView programs={programs.map(toCompare)} />;
}
