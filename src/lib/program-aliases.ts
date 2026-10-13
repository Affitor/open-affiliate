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
 */
export function resolveProgram(slugOrAlias: string): Program | undefined {
  const program = getProgram(slugOrAlias)
  if (program) return program
  const slug = ALIASES.get(slugOrAlias)
  return slug ? getProgram(slug) : undefined
}
