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
})

test("categories page still uses ProgramLogo", () => {
  assert.match(categories, /ProgramLogo/)
})

test("content-lab Generate yields a frame before fetch", () => {
  assert.match(contentLab, /requestAnimationFrame/)
  const gen = contentLab.indexOf("async function handleGenerate")
  const fetchAt = contentLab.indexOf('fetch("/api/content-lab"')
  const rafAt = contentLab.indexOf("requestAnimationFrame")
  assert.ok(gen >= 0 && rafAt > gen && fetchAt > rafAt)
})
