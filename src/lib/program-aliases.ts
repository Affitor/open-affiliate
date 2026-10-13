import registryData from "./registry.json"
import { getProgram, type Program } from "./programs"

/**
 * Alias → slug, as scripts/build-registry.ts wrote it (rule in
 * scripts/program-rules.ts aliasRoutes). The committed registry.json can
 * predate the field; prebuild regenerates it on every build.
 */
const ALIASES = new Map(
  Object.entries((registryData as { aliases?: Record<string, string> }).aliases ?? {})
)

/**
 * A program by its slug or by one of its aliases, for the REST API and MCP
 * get_program. Pages do not use this: /programs/<alias> is a 308 in
 * next.config.ts, so a page has one URL. A real slug always wins.
 *
 * The exact input is tried first, so a real slug answers as it always did.
 * Then the input is trimmed and lowercased, matching the page redirects,
 * which Next matches case-insensitively (/programs/Quso is a 308 too).
 */
export function resolveProgram(slugOrAlias: string): Program | undefined {
  const key = slugOrAlias.trim().toLowerCase()
  const program = getProgram(slugOrAlias) ?? getProgram(key)
  if (program) return program
  const slug = ALIASES.get(key)
  return slug ? getProgram(slug) : undefined
}
