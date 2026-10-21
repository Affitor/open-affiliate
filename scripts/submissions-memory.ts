/**
 * In-memory SubmissionStore for tests: the same contract as the database
 * function submission_submit (migration 013), with a promise chain standing
 * in for its advisory lock. Keep the two in step.
 */
import { randomUUID } from "node:crypto"
import type { Caps, NewSubmission, SubmissionRow, SubmissionStore, SubmitOutcome } from "../src/lib/submissions/service"

export interface MemoryRow extends SubmissionRow, NewSubmission {}
export interface MemoryEvent {
  type: string
  domain: string | null
  ip_hash: string | null
  at: number
  meta: Record<string, unknown>
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

export function memoryStore(clock: { now: number } = { now: Date.now() }) {
  const rows: MemoryRow[] = []
  const events: MemoryEvent[] = []
  let lock: Promise<unknown> = Promise.resolve()
  /** Runs fn after every earlier call has finished, like pg_advisory_xact_lock. */
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = lock.then(fn, fn)
    lock = run.catch(() => undefined)
    return run
  }
  const iso = () => new Date(clock.now).toISOString()
  const since = (ms: number) => clock.now - ms
  const requested = (filter: (e: MemoryEvent) => boolean, ms: number) =>
    events.filter((e) => e.type === "submission.requested" && e.at > since(ms) && filter(e)).length
  const publicRow = (r: MemoryRow): SubmissionRow => ({
    id: r.id,
    status: r.status,
    reason: r.reason,
    listed_slug: r.listed_slug,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })

  const store: SubmissionStore & {
    rows: MemoryRow[]
    events: MemoryEvent[]
    setStatus(id: string, from: string, to: string, reason?: string | null, slug?: string | null): Promise<boolean>
    /** Runs between the lock and the work, to force an interleaving in a test. */
    onLocked?: () => Promise<void> | void
  } = {
    rows,
    events,
    submit(row: NewSubmission, caps: Caps): Promise<SubmitOutcome> {
      return locked(async () => {
        await store.onLocked?.()
        const ipHour = requested((e) => e.ip_hash === row.ip_hash, HOUR)
        const ipDay = requested((e) => e.ip_hash === row.ip_hash, DAY)
        if (ipHour >= caps.ipHour) return { result: "limited", window: "ip_hour" }
        if (ipDay >= caps.ipDay) return { result: "limited", window: "ip_day" }
        if (requested((e) => e.domain === row.domain, DAY) >= caps.domainDay) return { result: "limited", window: "domain_day" }
        if (requested(() => true, DAY) >= caps.siteRequestsDay) {
          if (!events.some((e) => e.type === "cap.reached" && e.at > since(DAY))) {
            events.push({ type: "cap.reached", domain: null, ip_hash: null, at: clock.now, meta: { cap: "submissions" } })
          }
          return { result: "limited", window: "site_day" }
        }
        let found = rows.find((r) => r.domain === row.domain && (r.status === "queued" || r.status === "verifying"))
        let result: "new" | "duplicate" = "duplicate"
        if (!found) {
          const today = rows.filter((r) => Date.parse(r.created_at) > since(DAY))
          const plain = today.filter((r) => r.source !== "web").length
          if (today.length >= caps.siteNewDay || (row.source !== "web" && plain >= caps.siteNewPlainDay)) {
            return { result: "limited", window: "site_new" }
          }
          found = { ...row, id: randomUUID(), status: "queued", reason: null, listed_slug: null, created_at: iso(), updated_at: iso() }
          rows.push(found)
          result = "new"
        }
        events.push({ type: "submission.requested", domain: row.domain, ip_hash: row.ip_hash, at: clock.now, meta: { source: row.source, outcome: result } })
        return { result, row: publicRow(found), ipHour: ipHour + 1 }
      })
    },
    async get(id) {
      const r = rows.find((x) => x.id === id)
      return r ? publicRow(r) : null
    },
    setStatus(id, from, to, reason = null, slug = null) {
      return locked(async () => {
        const r = rows.find((x) => x.id === id && x.status === from)
        if (!r) return false
        r.status = to as MemoryRow["status"]
        r.reason = (to === "rejected" ? reason : null) as MemoryRow["reason"]
        r.listed_slug = to === "listed" ? slug : null
        r.updated_at = iso()
        return true
      })
    },
  }
  return store
}
