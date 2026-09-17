/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const logo = fs.readFileSync(
  path.join(__dirname, "../../src/components/program-logo.tsx"),
  "utf8"
)
const categories = fs.readFileSync(
  path.join(__dirname, "../../src/app/categories/page.tsx"),
  "utf8"
)
const contentLab = fs.readFileSync(
  path.join(__dirname, "../../src/app/content-lab/page.tsx"),
  "utf8"
)

test("ProgramLogo is not a client island", () => {
  assert.doesNotMatch(logo, /['"]use client['"]/)
  assert.doesNotMatch(logo, /useState\(/)
  assert.match(logo, /from "next\/image"/)
  assert.match(logo, /\{file \? \(/)
})

test("categories page still uses ProgramLogo", () => {
  assert.match(categories, /ProgramLogo/)
})

test("content-lab Generate paints then double-rAF before fetch", () => {
  assert.match(contentLab, /flushSync/)
  const gen = contentLab.indexOf("async function handleGenerate")
  const fetchAt = contentLab.indexOf('fetch("/api/content-lab"')
  const firstRaf = contentLab.indexOf("requestAnimationFrame", gen)
  const secondRaf = contentLab.indexOf("requestAnimationFrame", firstRaf + 1)
  assert.ok(gen >= 0 && firstRaf > gen && secondRaf > firstRaf && fetchAt > secondRaf)
})
