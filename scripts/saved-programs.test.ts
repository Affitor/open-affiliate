import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
import { test } from "node:test"
import { createSavedStore, EMPTY_SAVED, parseSaved, SAVED_KEY, SAVED_LIMIT_MESSAGE } from "../src/lib/saved-programs"

const known = (slug: string) => /^program-\d+$/.test(slug) || slug === "removed"
const raw = (items: unknown[]) => JSON.stringify({ v: 1, items })
function fixture() {
  let value: string | null = null
  const store = createSavedStore(() => ({ getItem: () => value, setItem: (_k, v) => { value = v } }), known)
  return { store, set: (v: string | null) => { value = v }, value: () => value }
}

test("corrupt JSON, bad versions and malformed records are ignored", () => {
  for (const value of [null, "{", "null", "[]", '{"v":2,"items":[]}', '{"v":1,"items":null}']) assert.deepEqual(parseSaved(value, known), EMPTY_SAVED)
  assert.deepEqual(parseSaved(raw([{ slug: "program-1", savedAt: 3 }, { slug: "unknown", savedAt: 4 }, { slug: "program-2", savedAt: "bad" }, null, { slug: "program-1", savedAt: 1 }, { slug: "program-3", savedAt: -1 }]), known).items, [{ slug: "program-1", savedAt: 3 }])
})

test("throwing getter, read and writes do not crash or pretend to save", () => {
  for (const storage of [() => { throw Error("denied") }, () => ({ getItem() { throw Error("read") }, setItem() {} }), () => ({ getItem() { return null }, setItem() { throw Error("quota") } })]) {
    const store = createSavedStore(storage, known)
    assert.equal(store.getSnapshot(), EMPTY_SAVED)
    assert.ok(store.toggle("program-1").error)
    assert.equal(store.getSnapshot().items.length, 0)
  }
})

test("stable cached snapshots, empty SSR and same-tab notifications", () => {
  const { store, value } = fixture()
  assert.equal(store.getServerSnapshot(), EMPTY_SAVED)
  assert.equal(store.getSnapshot(), store.getSnapshot())
  let notifications = 0
  const stop = store.subscribe(() => notifications++)
  assert.deepEqual(store.toggle("program-1"), { saved: true })
  assert.equal(notifications, 1)
  assert.deepEqual(JSON.parse(value()!), { v: 1, items: [{ slug: "program-1", savedAt: store.getSnapshot().items[0].savedAt }] })
  assert.equal(store.getSnapshot(), store.getSnapshot())
  assert.deepEqual(store.toggle("program-1"), { saved: false })
  assert.equal(notifications, 2)
  stop()
  store.toggle("program-2")
  assert.equal(notifications, 2)
  assert.equal(store.getServerSnapshot(), EMPTY_SAVED)
  assert.equal(SAVED_KEY, "oa-saved")
})

test("cap 500 rejects #501 without writing, but still permits unsave", () => {
  const { store, set, value } = fixture()
  set(raw(Array.from({ length: 500 }, (_, i) => ({ slug: `program-${i}`, savedAt: i }))))
  const before = value()
  assert.deepEqual(store.toggle("program-500"), { error: SAVED_LIMIT_MESSAGE })
  assert.equal(value(), before)
  assert.equal(store.getSnapshot().items.length, 500)
  assert.equal(store.toggle("program-0").saved, false)
  assert.equal(store.toggle("program-500").saved, true)
})

test("read cap, newest-first, cross-tab changes, and historical tombstones", () => {
  const { store, set } = fixture()
  set(raw(Array.from({ length: 502 }, (_, i) => ({ slug: `program-${i}`, savedAt: i }))))
  assert.equal(store.getSnapshot().items.length, 500)
  assert.equal(store.getSnapshot().items[0].slug, "program-501")
  set(raw([{ slug: "removed", savedAt: 5 }, { slug: "never-existed", savedAt: 6 }]))
  store.notify()
  assert.deepEqual(store.getSnapshot().items, [{ slug: "removed", savedAt: 5 }])
  assert.equal(store.toggle("removed").saved, false)
  assert.ok(store.toggle("never-existed").error)
})

test("Save button: one name in both states, a dismissable 500-cap note; /new renders no row without its data", () => {
  const button = readFileSync(new URL("../src/components/save-button.tsx", import.meta.url), "utf8")
  // A toggle keeps its name; aria-pressed carries the state (no "Unsave", no "Saved" label).
  assert.match(button, /aria-label=\{`Save \$\{name\}`\}/)
  assert.match(button, /aria-pressed=\{saved\}/)
  assert.doesNotMatch(button, /Unsave|"Saved"/)
  // The note closes with its button or Escape.
  assert.match(button, /aria-label="Dismiss" onClick=\{\(\) => setError\(undefined\)\}/)
  assert.match(button, /event\.key === "Escape"\) setError\(undefined\)/)
  const page = readFileSync(new URL("../src/app/new/page.tsx", import.meta.url), "utf8")
  assert.doesNotMatch(page, /\.get\([^)]*\)!/)
})
