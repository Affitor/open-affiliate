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

      <div className="space-y-10">
        <section>
          <h2 id="endpoints" className="text-lg font-semibold mb-3">Endpoints</h2>
          <div className="space-y-3">
            {[
              {
                method: "GET",
                path: "/api/programs",
                desc: "List all programs",
                params: "?q=, ?category=, ?type=, ?verified=",
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
            Programs with <code>status</code> <code>paused</code>, <code>discontinued</code> or <code>no_program</code> are returned by slug but not in search results. A <code>discontinued</code> or <code>no_program</code> entry carries no terms: it returns <code>answer</code> and <code>alternatives</code> instead.
          </p>
          <CodeBlock
            label="curl"
            code={`curl "https://openaffiliate.dev/api/programs?q=database&type=recurring&verified=true"

# Response
[
  {
    "slug": "supabase",
    "name": "Supabase",
    "commission": { "type": "recurring", "rate": "10%" },
    "cookieDays": 60,
    "category": "Database",
    "verified": true,
    ...
  }
]`}
          />
        </section>
      </div>

      <DocsPagination currentPath="/docs/api" />
    </div>
  );
}
