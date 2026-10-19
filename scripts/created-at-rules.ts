export function createdAtProblems(current: Record<string, unknown>, previous?: Record<string, unknown>): string[] {
  const value = current.created_at
  const problems: string[] = []
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    problems.push("created_at is required and must be a valid YYYY-MM-DD date")
  }
  if (previous?.created_at !== undefined && previous.created_at !== value) problems.push("existing created_at must not change")
  return problems
}
