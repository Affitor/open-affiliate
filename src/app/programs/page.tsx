import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { livePrograms } from "@/lib/programs";
import { ProgramsView } from "./programs-view";

/**
 * The interactive list renders in the browser (it reads the URL inside its
 * own Suspense). Every live program as a plain link a crawler can follow
 * lives on /programs/a-z (redesign r3: "dua xuong chan trang la muc rieng"),
 * linked from here and from every page's footer.
 */
export default function ProgramsPage() {
  return (
    <div className="oa-frame">
      <ProgramsView />
      <div className="oa-band !py-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/programs/a-z" prefetch={false} className="inline-flex items-center gap-1.5 underline decoration-line-strong underline-offset-4 hover:decoration-current">
          All programs A–Z <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{livePrograms.length.toLocaleString("en-US")} names on one page</span>
      </div>
    </div>
  );
}
