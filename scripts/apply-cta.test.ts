import assert from "node:assert/strict"
import { test } from "node:test"
import { alsoOnAffitor, applyButton, applyEarnLabel, checkTermsLabel, ctaWordCount } from "../src/lib/apply-cta"
import type { Program } from "../src/lib/programs"

function commission(partial: Partial<Program["commission"]>): Program["commission"] {
  return {
    type: "recurring",
    rate: "20%",
    mode: "percentage",
    value: 20,
    currency: "USD",
    ...partial,
  }
}

test("percentage uses the signed wording and stays within 4 words", () => {
  const label = applyEarnLabel(commission({ mode: "percentage", value: 20, rate: "20%" }))
  assert.equal(label, "Apply & earn 20%")
  assert.ok(ctaWordCount(label) <= 4)
  assert.equal(label.includes("—") || label.includes("–"), false)
})

test("flat fee does not grow a percent sign", () => {
  const label = applyEarnLabel(commission({ mode: "flat", type: "one-time", value: 36, rate: "$36" }))
  assert.equal(label, "Apply & earn $36")
  assert.ok(ctaWordCount(label) <= 4)
})

test("unknown and long rates stay short", () => {
  assert.equal(applyEarnLabel(commission({ mode: "unknown", value: null, rate: "varies" })), "Apply & earn")
  const long = applyEarnLabel(
    commission({ mode: "hybrid", value: null, rate: "$5 per lead + 30%" }),
  )
  assert.equal(long, "Apply & earn")
  assert.ok(ctaWordCount(long) <= 4)
})

test("unverified CTA carries no number and stays within 4 words", () => {
  assert.equal(checkTermsLabel("Perplexity"), "Check terms on Perplexity")
  assert.equal(checkTermsLabel("Housecall Pro"), "Check program terms")
  assert.ok(ctaWordCount(checkTermsLabel("Fathom Analytics")) <= 4)
})

test("credit rewards carry no dollar figure", () => {
  const label = applyEarnLabel(commission({ mode: "flat", type: "one-time", value: 20, rate: "$20 in Replit credits" }))
  assert.equal(label, "Apply & earn credits")
  assert.ok(ctaWordCount(label) <= 4)
})

function program(partial: Partial<Program>): Program {
  return {
    slug: "citegraph",
    name: "CiteGraph",
    url: "https://www.citegraph.app",
    logo: "C",
    category: "SaaS",
    commission: commission({}),
    payout: {},
    description: "",
    shortDescription: "",
    tags: [],
    stars: 0,
    verified: true,
    agentPrompt: "",
    submittedBy: "affitor",
    createdAt: "2026-10-12",
    signupUrl: "https://affitor.com/marketplace/citegraph",
    network: "affitor",
    status: "active",
    ...partial,
  }
}

test("a live Affitor program applies on Affitor, with UTM added at render time", () => {
  const cta = applyButton(program({}))
  assert.equal(cta.label, "Apply on Affitor")
  assert.ok(ctaWordCount(cta.label) <= 4)
  assert.equal(
    cta.href,
    "https://affitor.com/marketplace/citegraph?utm_source=openaffiliate&utm_medium=apply&utm_campaign=citegraph",
  )
})

test("the campaign is the OA slug, not the Affitor marketplace slug", () => {
  const cta = applyButton(
    program({ slug: "jobholler", signupUrl: "https://affitor.com/marketplace/jobholler-partner-program" }),
  )
  assert.equal(new URL(cta.href).pathname, "/marketplace/jobholler-partner-program")
  assert.equal(new URL(cta.href).searchParams.get("utm_campaign"), "jobholler")
})

test("a paused Affitor program keeps the plain link and the ordinary label", () => {
  const cta = applyButton(program({ status: "paused" }))
  assert.equal(cta.href, "https://affitor.com/marketplace/citegraph")
  assert.notEqual(cta.label, "Apply on Affitor")
})

test("other networks keep their signup link and label untouched", () => {
  const cta = applyButton(program({ network: "in-house", signupUrl: "https://landerlab.io/affiliates" }))
  assert.equal(cta.label, "Apply & earn 20%")
  assert.equal(cta.href, "https://landerlab.io/affiliates")
  const noSignup = applyButton(program({ network: "in-house", signupUrl: undefined, verified: false }))
  assert.equal(noSignup.label, "Check terms on CiteGraph")
  assert.equal(noSignup.href, "https://www.citegraph.app")
})

test("a brand also on Affitor keeps its own button and gains one Affitor line and a secondary button", () => {
  const url = "https://affitor.com/marketplace/landerlab"
  const own = program({
    slug: "landerlab",
    name: "LanderLab",
    network: "in-house",
    signupUrl: "https://landerlab.io/affiliates",
    commission: commission({ rate: "30%", value: 30, duration: "lifetime" }),
    alsoOn: { affitor: { url, commission: commission({ duration: "12 months" }) } },
  })
  assert.deepEqual(alsoOnAffitor(own), {
    line: "Also on Affitor: 20% recurring/12mo",
    label: "Apply on Affitor",
    href: `${url}?utm_source=openaffiliate&utm_medium=apply&utm_campaign=landerlab`,
  })
  assert.ok(ctaWordCount(alsoOnAffitor(own)!.label) <= 4)
  assert.deepEqual(applyButton(own), { label: "Apply & earn 30%", href: "https://landerlab.io/affiliates" })
  // No figure when Affitor publishes none, or none that reads as a number.
  assert.equal(alsoOnAffitor({ ...own, alsoOn: { affitor: { url } } })!.line, "Also on Affitor")
  const unknown = commission({ mode: "unknown", value: null, rate: "varies" })
  assert.equal(alsoOnAffitor({ ...own, alsoOn: { affitor: { url, commission: unknown } } })!.line, "Also on Affitor")
  assert.equal(alsoOnAffitor(program({})), null)
  assert.equal(alsoOnAffitor(program({ alsoOn: null })), null)
})

test("a stored rate that qualifies the figure gets no number in the button", () => {
  assert.equal(applyEarnLabel(commission({ mode: "flat", type: "one-time", value: 1000, rate: "$15 to $1,000" })), "Apply & earn")
  assert.equal(applyEarnLabel(commission({ mode: "percentage", value: 30, rate: "up to 30%" })), "Apply & earn")
  assert.equal(applyEarnLabel(commission({ mode: "percentage", value: 25, rate: "25" })), "Apply & earn 25%")
  assert.equal(applyEarnLabel(commission({ mode: "flat", type: "one-time", value: 1000, rate: "$1000" })), "Apply & earn $1,000")
})
