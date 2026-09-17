/**
 * Serialize JSON-LD without allowing registry text to terminate its <script>.
 *
 * JSON permits these escapes and JSON.parse restores the original text. The
 * line-separator escapes also keep the payload valid if it is ever embedded in
 * JavaScript rather than an application/ld+json block.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
