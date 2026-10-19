import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";
import { DocsHeader } from "@/components/docs-header";
import { DocsPagination } from "@/components/docs-pagination";

export const metadata: Metadata = {
  title: "REST API",
};

export default function APIPage() {
  return (
    <div>
      <DocsHeader
        group="References"
        title="REST API"
        description="Query the registry with simple HTTP requests. No auth required."
      />

      <p className="text-sm text-muted-foreground mb-6">
        Download the <a href="/openapi.json" className="underline">OpenAPI 3.1 specification</a> for parameter and response schemas.
        Unknown query values are ignored rather than rejected; an unknown slug or API path returns HTTP 404.
        Errors use <code>{'{ "error": { "code": "...", "message": "...", "hint": "..." } }'}</code>.
      </p>

      <div className="space-y-10">
        <section>
          <h2 id="endpoints" className="text-lg font-semibold mb-3">Endpoints</h2>
          <div className="space-y-3">
            {[
              {
                method: "GET",
                path: "/api/programs",
                desc: "List all programs",
                params: "?q=, ?category=, ?type=, ?verified=, ?include_description=, ?sort=, ?limit=, ?offset=",
              },
              {
                method: "GET",
                path: "/api/programs/{slug}",
                desc: "Get program details by slug",
                params: null,
              },
              {
                method: "GET",
                path: "/api/categories",
                desc: "List all categories with program counts",
                params: null,
              },
            ].map((item) => (
              <div
                key={item.path}
                className="rounded-2xl bg-muted/60 dark:bg-zinc-950 border border-border/50 px-4 py-3 flex items-start gap-3 overflow-x-auto"
              >
                <span className="text-[10px] font-mono font-bold bg-emerald-600/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  {item.method}
                </span>
                <div className="min-w-0">
                  <code className="text-xs font-mono whitespace-nowrap">
                    {item.path}
                  </code>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {item.desc}
                    {item.params && (
                      <span className="text-muted-foreground/60">
                        {" "}
                        ({item.params})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 id="example" className="text-lg font-semibold mb-3">Example</h2>
          <p className="text-sm text-muted-foreground mb-3">
            <code>cookieDays</code> and the <code>payout</code> fields are left out when a program does not publish them.
            For a program with <code>verified</code> <code>false</code>, <code>cookieDays</code>, <code>approval</code>,{" "}
            <code>approvalTime</code> and <code>payoutMethods</code> are left out and <code>payout</code> is an empty object
            until its terms are checked against the program&apos;s own page, and sentences of its free text that state them
            are dropped; its <code>commission</code> is returned but unconfirmed.
            Programs with <code>status</code> <code>paused</code>, <code>discontinued</code> or <code>no_program</code> are returned by slug but not in search results or category counts.
          </p>
          <CodeBlock
            label="curl"
            code={`curl "https://openaffiliate.dev/api/programs?q=database&type=recurring&verified=true"

# Response (abbreviated)
{
  "programs": [
  {
    "slug": "supabase",
    "name": "Supabase",
    "commission": { "type": "recurring", "rate": "10%" },
    "cookieDays": 60,
    "category": "Database",
    "verified": true,
    ...
  }
  ],
  "total": 1,
  "filters": { "q": "database", "category": null, "type": "recurring", "sort": "relevance" }
}`}
          />
        </section>

        <section>
          <h2 id="no-program" className="text-lg font-semibold mb-3">Brands with no affiliate program</h2>
          <p className="text-sm text-muted-foreground mb-3">
            <code>status</code> <code>no_program</code> means no public affiliate program could be found on the brand&apos;s own
            site; <code>discontinued</code> means the brand closed it. <code>GET /api/programs/{"{slug}"}</code> still answers for
            these, with the same shape as any program so existing clients keep working, but with no terms in it:
          </p>
          <ul className="text-sm text-muted-foreground mb-3 list-disc pl-5 space-y-1">
            <li>
              <code>commission</code> is a placeholder: <code>type</code> <code>&quot;none&quot;</code>, <code>rate</code>{" "}
              <code>&quot;No affiliate program&quot;</code>, <code>mode</code> <code>&quot;unknown&quot;</code>,{" "}
              <code>value</code> <code>null</code>. <code>payout</code> is an empty object. Cookie, signup, approval and
              restriction fields are left out.
            </li>
            <li>
              <code>answer</code> is the page&apos;s answer: &quot;No (checked &lt;date&gt;).&quot;, then the source and quote from{" "}
              <code>statusNote</code>.
            </li>
            <li>
              <code>alternatives</code> lists verified programs in the same category that pay cash, each with{" "}
              <code>slug</code>, <code>name</code>, <code>commission</code> and <code>url</code>. It can be empty.
            </li>
          </ul>
          <CodeBlock
            label="curl"
            code={`curl "https://openaffiliate.dev/api/programs/openrouter"

# Response
{
  "slug": "openrouter",
  "name": "OpenRouter",
  "status": "no_program",
  "commission": { "type": "none", "rate": "No affiliate program", "mode": "unknown", "value": null, "currency": "USD" },
  "payout": {},
  "answer": "No (checked 2026-10-12). OpenRouter has no public affiliate program. ...",
  "alternatives": [
    { "slug": "kyma-api", "name": "Kyma API", "commission": "12% recurring/18mo", "url": "https://openaffiliate.dev/programs/kyma-api" }
  ],
  ...
}`}
          />
        </section>

        <section>
          <h2 id="versioning" className="text-lg font-semibold mb-3">Versioning</h2>
          <p className="text-sm text-muted-foreground">
            Every response carries an <code>API-Version</code> header, currently <code>1</code>. Breaking changes ship only
            under a new major version; new fields, parameters and endpoints can be added to the current one. A field,
            parameter or endpoint is deprecated at least 90 days before it is removed: its responses then carry a{" "}
            <code>Deprecation</code> header (RFC 9745) with the date it was deprecated and a <code>Sunset</code> header
            (RFC 8594) with the date it stops working, and the change is listed in the{" "}
            <a href="/changelog" className="underline">changelog</a>.
          </p>
        </section>
      </div>

      <DocsPagination currentPath="/docs/api" />
    </div>
  );
}
