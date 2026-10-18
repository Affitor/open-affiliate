/**
 * The hosted MCP route's CORS headers and flood guard (src/lib/mcp-route.ts).
 *
 * Run with `npx tsx --test --test-force-exit scripts/mcp-route.test.ts`: the
 * MCP route keeps a timer alive (see no-program.test.ts).
 *
 * The limiter's window is module state. Tests that call withinLimit freeze
 * Date.now at a time of their own, later than any earlier test's, so each one
 * starts a fresh window and none depends on the real clock.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { clientAddress, createMcpRoute, withinLimit } from "../src/lib/mcp-route"

const PER_WINDOW = 1200
const WINDOW_MS = 60_000

let clock = Date.now()
/** Freeze Date.now at a fresh time, one hour past the previous test's. */
function freeze(t: { after: (fn: () => void) => void }): { now: number } {
  clock += 60 * WINDOW_MS
  const c = { now: clock }
  mock.method(Date, "now", () => c.now)
  t.after(() => mock.restoreAll())
  return c
}

function from(address: string): Request {
  return new Request("https://openaffiliate.dev/mcp", {
    method: "POST",
    headers: { "x-forwarded-for": address },
  })
}

test("preflight allows mcp-protocol-version, which the SDK sends after initialize", () => {
  for (const base of ["", "/api"]) {
    const res = createMcpRoute(base).OPTIONS()
    assert.equal(res.status, 204)
    const allowed = (res.headers.get("access-control-allow-headers") ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
    for (const h of ["content-type", "authorization", "accept", "mcp-protocol-version"]) {
      assert.ok(allowed.includes(h), `${base}/mcp preflight is missing ${h}: ${allowed}`)
    }
    assert.equal(res.headers.get("access-control-expose-headers"), "Retry-After")
  }
})

test("client address keys are capped at 45 characters, the longest unscoped textual IPv6", () => {
  const longestIpv6 = "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255"
  assert.equal(longestIpv6.length, 45)
  assert.equal(clientAddress(from(longestIpv6)), longestIpv6)
  assert.equal(clientAddress(from("203.0.113.7, 10.0.0.1")), "203.0.113.7")
  assert.equal(clientAddress(from("x".repeat(8192))).length, 45)
  const realIp = new Request("https://openaffiliate.dev/mcp", { headers: { "x-real-ip": "y".repeat(500) } })
  assert.equal(clientAddress(realIp), "y".repeat(45))
  assert.equal(clientAddress(new Request("https://openaffiliate.dev/mcp")), "unknown")
})

test("a capped key does not keep the long header it was cut from alive", () => {
  setFlagsFromString("--expose-gc")
  const gc = runInNewContext("gc") as () => void
  const heap = () => {
    gc()
    gc()
    return process.memoryUsage().heapUsed
  }
  const keys: string[] = []
  const before = heap()
  for (let i = 0; i < 10_000; i++) {
    keys.push(clientAddress(from(`retain-${i}-`.padEnd(45, "a") + "x".repeat(8192) + i)))
  }
  const retainedMiB = (heap() - before) / 1048576
  assert.equal(new Set(keys).size, 10_000)
  // 10,000 × 8 KB headers is ~80 MiB if each key is a view into its header;
  // copies of 45 characters are ~1 MiB.
  assert.ok(retainedMiB < 10, `10,000 capped keys retained ${retainedMiB.toFixed(1)} MiB`)
})

test("addresses that differ only after 45 characters share one bucket", (t) => {
  freeze(t)
  const prefix = "cap-test-".padEnd(45, "a")
  for (let i = 0; i < PER_WINDOW; i++) {
    assert.ok(withinLimit(from(prefix + "-" + i + "-".repeat(4000))), `request ${i + 1} was refused`)
  }
  assert.equal(withinLimit(from(prefix + "-another")), false)
})

test("the window is fixed: 1200 just before a boundary and 1200 just after all get through", (t) => {
  const c = freeze(t)
  // Another address opens the window at c.now.
  assert.ok(withinLimit(from("192.0.2.1")))

  const address = "198.51.100.23"
  c.now += WINDOW_MS - 1
  let allowed = 0
  for (let i = 0; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, PER_WINDOW, "the first window must stop at 1200")

  c.now += 1 // next window, 1 ms later
  for (let i = 0; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, 2 * PER_WINDOW, "2400 from one address within 1 ms across the boundary")
})
