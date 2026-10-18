/**
 * llms.txt is fetched once and read whole, so it is kept small.
 *
 * Calling 10240 a budget was generous to it: the file had grown to 4 bytes
 * under this number, which makes it a line the file grew into rather than a
 * figure anyone derived. It is a deliberate choice to keep the index
 * skimmable — roughly 2.5k tokens — and llmstxt.org sets no limit at all.
 *
 * What changed is that the file no longer grows with the number of verified
 * programs: the index shows a bounded sample and links verified.md for the
 * rest, with names and terms clipped to byte budgets (INLINE_NAME_MAX,
 * INLINE_TERMS_MAX in generate-md.ts). What still grows it is that categories
 * and networks are enumerated in full, one line each, and validateProgram
 * enforces neither enum, so the registry can introduce new values.
 *
 * Measured 2026-10-17: 7276 bytes, 13 network lines at ~77 bytes, 20 category
 * lines at ~97. The 2964 bytes of headroom are about 36–38 more networks — fewer
 * than the 12 → 58 networks the competitor plan (A5) adds. That change has to
 * move the network list to a linked surface, as the verified list was.
 * scripts/llms-budget.test.ts measures the per-line cost and the headroom.
 *
 * If the cap fires, move content to a linked surface rather than raising it.
 */
export const LLMS_MAX_BYTES = 10240
