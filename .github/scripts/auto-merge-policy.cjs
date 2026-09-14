/* eslint-disable @typescript-eslint/no-require-imports */
const { parseDocument } = require("yaml")

const MAX_PROGRAM_FILES = 3
const MAX_ADDITIONS_PER_FILE = 150
const MAX_TOTAL_ADDITIONS = 300
const MAX_FILE_BYTES = 20_000
const FETCH_TIMEOUT_MS = 10_000

const PROGRAM_PATH = /^programs\/[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$/
const BLOCKING_LABELS = new Set([
  "do-not-merge",
  "needs-human-review",
  "security",
])

function parseProgramYaml(content, filename, reasons) {
  let document
  try {
    document = parseDocument(content, {
      strict: true,
      uniqueKeys: true,
    })
  } catch {
    reasons.push(`invalid YAML: ${filename}`)
    return undefined
  }

  if (document.errors.length > 0) {
    reasons.push(`invalid or duplicate YAML keys: ${filename}`)
    return undefined
  }

  let program
  try {
    program = document.toJS({ maxAliasCount: 0 })
  } catch {
    reasons.push(`invalid or aliased YAML: ${filename}`)
    return undefined
  }

  if (
    !program ||
    typeof program !== "object" ||
    Array.isArray(program)
  ) {
    reasons.push(`program YAML must be a mapping: ${filename}`)
    return undefined
  }

  return program
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    )
  } catch {
    return false
  }
}

async function fetchProgramContent(
  rawUrl,
  {
    fetchImpl = globalThis.fetch,
    maxBytes = MAX_FILE_BYTES,
    timeoutMs = FETCH_TIMEOUT_MS,
  } = {}
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException(`timed out after ${timeoutMs}ms`, "TimeoutError")
    )
  }, timeoutMs)

  try {
    const response = await fetchImpl(rawUrl, {
      headers: { Accept: "text/plain" },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentLength = Number(response.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`response exceeds ${maxBytes} bytes`)
    }
    if (!response.body) {
      throw new Error("response has no body")
    }

    const reader = response.body.getReader()
    const chunks = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        throw new Error(`response exceeds ${maxBytes} bytes`)
      }
      chunks.push(Buffer.from(value))
    }

    return Buffer.concat(chunks, totalBytes).toString("utf8")
  } finally {
    clearTimeout(timeout)
  }
}

function evaluateAutoMergePolicy({ pullRequest, files }) {
  const reasons = []
  const labels = new Set(
    (pullRequest.labels ?? []).map((label) =>
      typeof label === "string" ? label : label.name
    )
  )

  if (pullRequest.base?.ref !== "main") {
    reasons.push("base branch is not main")
  }
  if (pullRequest.draft) {
    reasons.push("pull request is a draft")
  }

  for (const label of BLOCKING_LABELS) {
    if (labels.has(label)) reasons.push(`blocking label: ${label}`)
  }

  if (files.length === 0) {
    reasons.push("pull request has no changed files")
  }
  if (files.length > MAX_PROGRAM_FILES) {
    reasons.push(`changes more than ${MAX_PROGRAM_FILES} program files`)
  }

  const totalAdditions = files.reduce(
    (total, file) => total + (file.additions ?? 0),
    0
  )
  if (totalAdditions > MAX_TOTAL_ADDITIONS) {
    reasons.push(`adds more than ${MAX_TOTAL_ADDITIONS} lines`)
  }

  for (const file of files) {
    if (!PROGRAM_PATH.test(file.filename)) {
      reasons.push(`sensitive or non-program path: ${file.filename}`)
      continue
    }
    if (file.status !== "added") {
      reasons.push(`program is ${file.status}, not newly added: ${file.filename}`)
    }
    if ((file.deletions ?? 0) !== 0) {
      reasons.push(`deletes lines: ${file.filename}`)
    }
    if ((file.additions ?? 0) > MAX_ADDITIONS_PER_FILE) {
      reasons.push(
        `adds more than ${MAX_ADDITIONS_PER_FILE} lines: ${file.filename}`
      )
    }

    const content = file.content
    if (typeof content !== "string") {
      reasons.push(`could not read: ${file.filename}`)
      continue
    }
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      reasons.push(`is larger than ${MAX_FILE_BYTES} bytes: ${file.filename}`)
      continue
    }
    const program = parseProgramYaml(content, file.filename, reasons)
    if (!program) continue

    const expectedSlug = file.filename
      .slice("programs/".length)
      .replace(/\.yaml$/, "")
    if (program.slug !== expectedSlug) {
      reasons.push(`slug must match filename: ${file.filename}`)
    }
    if (program.verified !== false) {
      reasons.push(`verified must be the boolean false: ${file.filename}`)
    }
    if (!isHttpsUrl(program.url)) {
      reasons.push(`must use an HTTPS product URL: ${file.filename}`)
    }
    if (!isHttpsUrl(program.signup_url)) {
      reasons.push(`must use an HTTPS signup URL: ${file.filename}`)
    }
    if (/<\/?script\b/i.test(content)) {
      reasons.push(`contains an HTML script tag: ${file.filename}`)
    }
  }

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    programCount: files.filter((file) => PROGRAM_PATH.test(file.filename)).length,
  }
}

module.exports = {
  BLOCKING_LABELS,
  FETCH_TIMEOUT_MS,
  MAX_ADDITIONS_PER_FILE,
  MAX_FILE_BYTES,
  MAX_PROGRAM_FILES,
  MAX_TOTAL_ADDITIONS,
  PROGRAM_PATH,
  evaluateAutoMergePolicy,
  fetchProgramContent,
}
