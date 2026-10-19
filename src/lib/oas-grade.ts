/**
 * OAS letter grades, Foothill style (Sơn 19/10 13:2x, "co the dung he diem nhu di hoc
 * foothill, sap xep gon gang, de nhin"): no C-, F under 60. No imports, so client components
 * can show a grade without loading the scores. /methodology shows the table from this list.
 */
export type OasGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D+" | "D" | "D-" | "F"

export const GRADE_BANDS: [grade: OasGrade, from: number][] = [
  ["A+", 97], ["A", 94], ["A-", 90],
  ["B+", 87], ["B", 84], ["B-", 80],
  ["C+", 77], ["C", 70],
  ["D+", 67], ["D", 64], ["D-", 60],
  ["F", 0],
]

/** The letter next to a score: the first band whose lower bound the score reaches. */
export function oasGrade(score: number): OasGrade {
  return GRADE_BANDS.find(([, from]) => score >= from)![0]
}

/** A, B, C, D or F: the chip's colour follows the family. */
export function gradeFamily(g: OasGrade): "A" | "B" | "C" | "D" | "F" {
  return g[0] as "A" | "B" | "C" | "D" | "F"
}
