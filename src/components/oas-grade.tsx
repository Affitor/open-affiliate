import { gradeFamily, oasGrade } from "@/lib/oas-grade";

/**
 * The letter beside an OAS, coloured by family as Sơn asked (19/10 13:2x): A green, B lime,
 * C amber, D orange, F red. The one place the site uses those hues (OA-DESIGN.md §1.3 exception).
 */
const TONE = {
  A: "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300",
  B: "border-lime-600/40 bg-lime-500/10 text-lime-700 dark:border-lime-400/40 dark:text-lime-300",
  C: "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:text-amber-300",
  D: "border-orange-600/40 bg-orange-500/10 text-orange-700 dark:border-orange-400/40 dark:text-orange-300",
  F: "border-red-600/40 bg-red-500/10 text-red-700 dark:border-red-400/40 dark:text-red-300",
} as const;

export function OasGradeChip({ score, className = "" }: { score: number; className?: string }) {
  const g = oasGrade(score);
  return (
    <span className={`inline-grid min-w-[26px] place-items-center rounded-[5px] border px-1 font-mono text-xs font-semibold leading-[18px] ${TONE[gradeFamily(g)]} ${className}`} title={`Grade ${g}`}>
      {g}
    </span>
  );
}
