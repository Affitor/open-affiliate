import type { Metadata } from "next";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "REST API",
};

export default function APIPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">REST API</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        Public JSON API. No authentication required. Base URL:{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
          https://openaffiliate.dev
        </code>
      </p>

      <div className="space-y-10">
        <section>
          <h2 className="text-lg font-semibold mb-3">Endpoints</h2>
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
                className="rounded-lg bg-muted/60 dark:bg-zinc-950 border border-border/50 px-4 py-3 flex items-start gap-3 overflow-x-auto"
              >
                <span className="text-[10px] font-mono font-bold bg-emerald-600/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                  {item.method}
                </span>
                <div className="min-w-0">
                  <code className="text-xs font-mono whitespace-nowrap">
                    {item.path}
                  </code>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
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
          <h2 className="text-lg font-semibold mb-3">Example</h2>
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
    </div>
  );
}
