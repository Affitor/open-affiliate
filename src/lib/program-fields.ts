// A missing published term is different from a published zero.
export function isPublishedNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

export function cookieWindowDisplay(value: unknown, suffix = " days"): string {
  return isPublishedNumber(value) ? `${value}${suffix}` : "Not published"
}

export function minimumPayoutDisplay(value: unknown): string {
  return isPublishedNumber(value) ? `$${value}` : "Not published"
}

export function publishedText(value: string | null | undefined): string {
  return value?.trim() || "Not published"
}

export function averagePublishedCookie(values: unknown[]): number | undefined {
  const published = values.filter(isPublishedNumber)
  return published.length
    ? published.reduce((sum, value) => sum + value, 0) / published.length
    : undefined
}

export function cookieScore(value: unknown): number {
  return isPublishedNumber(value) ? Math.min(value / 90, 1) * 15 : 0
}
