/**
 * The hosted MCP route's CORS headers and flood guard (src/lib/mcp-route.ts).
 *
 * Run with `npx tsx --test --test-force-exit scripts/mcp-route.test.ts`: the
 * MCP route keeps a timer alive (see no-program.test.ts).
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { clientAddress, createMcpRoute, withinLimit } from "../src/lib/mcp-route"

const PER_WINDOW = 1200
const WINDOW_MS = 60_000

function from(address: string): Request {
  return new Request("https://openaffiliate.dev/mcp", {
    method: "POST",
    headers: { "x-forwarded-for": address },
  })
}

test("preflight allows mcp-protocol-version, which the SDK sends after initialize", async () => {
  for (const base of ["", "/api"]) {
    const res = createMcpRoute(base).OPTIONS()
    assert.equal(res.status, 204)
    const allowed = (res.headers.get("access-control-allow-headers") ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
    for (const h of ["content-type", "authorization", "accept", "mcp-protocol-version"]) {
      assert.ok(allowed.includes(h), `${base}/mcp preflight is missing ${h}: ${allowed}`)
    }
  }
})

test("client address keys are capped at 45 characters, the longest textual IPv6", () => {
  const longestIpv6 = "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255"
  assert.equal(longestIpv6.length, 45)
  assert.equal(clientAddress(from(longestIpv6)), longestIpv6)
  assert.equal(clientAddress(from("203.0.113.7, 10.0.0.1")), "203.0.113.7")
  assert.equal(clientAddress(from("x".repeat(8192))).length, 45)
})

test("addresses that differ only after 45 characters share one bucket", () => {
  const prefix = "cap-test-".padEnd(45, "a")
  for (let i = 0; i < PER_WINDOW; i++) {
    assert.ok(withinLimit(from(prefix + "-" + i + "-".repeat(4000))), `request ${i + 1} was refused`)
  }
  assert.equal(withinLimit(from(prefix + "-another")), false)
})

test("the window is fixed: a burst across one boundary gets 2 × 1200 through", (t) => {
  let now = Date.now() + 10 * WINDOW_MS
  t.after(() => mock.restoreAll())
  mock.method(Date, "now", () => now)

  const address = "198.51.100.23"
  // Starts a fresh window at `now`.
  assert.ok(withinLimit(from(address)))
  now += WINDOW_MS - 1
  let allowed = 1
  for (let i = 1; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, PER_WINDOW, "the first window must stop at 1200")

  now += 1 // next window, 1 ms later
  for (let i = 0; i < PER_WINDOW + 50; i++) if (withinLimit(from(address))) allowed++
  assert.equal(allowed, 2 * PER_WINDOW, "the boundary lets 2400 through within a few ms")
})
