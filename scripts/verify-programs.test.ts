/**
 * Source policy in verify-programs: a host in schema/blocked-hosts.json gets
 * no request, at the first URL or behind any redirect, and the program is
 * reported as skipped, not failed. fetch is a stub that records every URL.
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { blockedReason } from "./blocked-hosts"
import { fetchPage, verifyProgram } from "./verify-programs"

const PAGE = "<html>Join our affiliate program: 30% recurring commission. Sign up</html>"

/** A fetch that answers from `routes` (url → redirect target or page) and records each request. */
function stub(routes: Record<string, { to: string } | { page: string }>) {
  const requested: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requested.push(url)
    assert.equal(init?.redirect, "manual", "redirects are followed by hand, so every hop is checked")
    const route = routes[url]
    if (!route) return new Response("not found", { status: 404 })
    if ("to" in route) return new Response(null, { status: 302, headers: { location: route.to } })
    return new Response(route.page, { status: 200 })
  }) as typeof fetch
  return { fetchImpl, requested }
}

const program = (signup_url: string) => ({
  name: "P",
  slug: "p",
  url: "https://p.example",
  signup_url,
  commission: { type: "recurring", rate: "30%" },
  verified: true,
})

test("a host on the list and every subdomain is blocked; look-alikes are not", () => {
  for (const url of [
    "https://partnerstack.com/x",
    "https://market.partnerstack.com/page/quil",
    "https://streak.partnerstack.com/",
    "https://MARKET.PartnerStack.com./page",
    "https://dub.co/x",
    "https://partners.dub.co/acme",
  ]) assert.ok(blockedReason(url), url)
  for (const url of ["https://notpartnerstack.com/", "https://partnerstack.com.evil.example/", "https://dub.com/", "https://p.example/?r=partnerstack.com", "not a url"]) {
    assert.equal(blockedReason(url), null, url)
  }
})

test("a blocked host gets zero requests and the program is skipped, not failed", async () => {
  for (const url of ["https://market.partnerstack.com/page/creditrepaircloud", "https://streak.partnerstack.com/", "https://partners.dub.co/acme"]) {
    const { fetchImpl, requested } = stub({})
    const result = await verifyProgram(program(url), fetchImpl)
    assert.deepEqual(requested, [], url)
    assert.equal(result.status, "skipped")
    assert.match(result.error ?? "", /^source policy: (partnerstack\.com|dub\.co): /)
  }
})

test("a redirect to a blocked host stops before the request, at any hop", async () => {
  const { fetchImpl, requested } = stub({
    "https://p.example/affiliates": { to: "/partners" },
    "https://p.example/partners": { to: "https://p.partnerstack.com/join" },
  })
  const result = await verifyProgram(program("https://p.example/affiliates"), fetchImpl)
  assert.deepEqual(requested, ["https://p.example/affiliates", "https://p.example/partners"])
  assert.equal(result.status, "skipped")
  assert.equal(result.final_url, "https://p.partnerstack.com/join")
})

test("an allowed page is followed through its redirects and read as before", async () => {
  const { fetchImpl, requested } = stub({
    "https://p.example/affiliates": { to: "https://www.p.example/affiliates" },
    "https://www.p.example/affiliates": { page: PAGE },
  })
  const page = await fetchPage("https://p.example/affiliates", fetchImpl)
  assert.deepEqual(page, { status: 200, text: PAGE, finalUrl: "https://www.p.example/affiliates" })
  assert.deepEqual(requested, ["https://p.example/affiliates", "https://www.p.example/affiliates"])
  const result = await verifyProgram(program("https://p.example/affiliates"), stub({ "https://p.example/affiliates": { page: PAGE } }).fetchImpl)
  assert.equal(result.status, "confirmed_affiliate")
})

test("a redirect loop ends after a bounded number of hops", async () => {
  const { fetchImpl, requested } = stub({ "https://p.example/a": { to: "https://p.example/b" }, "https://p.example/b": { to: "https://p.example/a" } })
  assert.equal(await fetchPage("https://p.example/a", fetchImpl), null)
  assert.ok(requested.length <= 2 * 11, `${requested.length} requests`)
})
