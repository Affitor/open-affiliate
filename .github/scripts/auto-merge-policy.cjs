const MAX_PROGRAM_FILES = 3
const MAX_ADDITIONS_PER_FILE = 150
const MAX_TOTAL_ADDITIONS = 300
const MAX_FILE_BYTES = 20_000

const PROGRAM_PATH = /^programs\/[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$/
const BLOCKING_LABELS = new Set([
  "do-not-merge",
  "needs-human-review",
  "security",
])

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
    }
    if (!/^verified:\s*false(?:\s+#.*)?$/m.test(content)) {
      reasons.push(`must explicitly set verified: false: ${file.filename}`)
    }
    if (!/^url:\s*https:\/\//m.test(content)) {
      reasons.push(`must use an HTTPS product URL: ${file.filename}`)
    }
    if (!/^signup_url:\s*https:\/\//m.test(content)) {
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
  MAX_ADDITIONS_PER_FILE,
  MAX_FILE_BYTES,
  MAX_PROGRAM_FILES,
  MAX_TOTAL_ADDITIONS,
  PROGRAM_PATH,
  evaluateAutoMergePolicy,
}
