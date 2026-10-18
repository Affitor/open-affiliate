import { Badge } from "@/components/ui/badge";
import type { Program } from "@/lib/programs";
import { claimsEnabledFor } from "@/lib/claims/rules";

/**
 * "Claimed by <domain>" once an owner has verified the listing, otherwise
 * "Unclaimed", but only where the claim flow is switched on (pilot listing,
 * every secret set). Separate from "Verified", which means OpenAffiliate
 * checked the terms. The way in ("Claim this page") sits in the page's owner box.
 */
export function ClaimChip({ program }: { program: Program }) {
  if (program.claimedBy) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
        Claimed by {program.claimedBy}
      </Badge>
    );
  }
  if (!claimsEnabledFor(program)) return null;
  return (
    <Badge variant="outline" className="text-xs shrink-0 border-dashed text-muted-foreground">
      Unclaimed
    </Badge>
  );
}
