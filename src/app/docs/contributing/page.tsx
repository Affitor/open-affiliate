import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contributing",
};

export default function ContributingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Contributing</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-10">
        OpenAffiliate is open source. All contributions welcome.
      </p>

      <div className="space-y-3 text-sm text-muted-foreground">
        {[
          {
            step: "01",
            content: (
              <>
                Fork{" "}
                <a
                  href="https://github.com/Affitor/open-affiliate"
                  className="text-foreground hover:underline"
                >
                  Affitor/open-affiliate
                </a>
              </>
            ),
          },
          {
            step: "02",
            content: (
              <>
                Create a YAML file in{" "}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                  programs/your-product.yaml
                </code>
              </>
            ),
          },
          {
            step: "03",
            content:
              "Open a pull request. CI validates the schema and verifies your signup URL automatically.",
          },
          {
            step: "04",
            content:
              "Community reviews and merges. Your program appears on the site within minutes.",
          },
        ].map((item) => (
          <div key={item.step} className="flex gap-3">
            <span className="text-xs font-mono text-muted-foreground/50 mt-0.5">
              {item.step}
            </span>
            <p>{item.content}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border/40 bg-muted/10 p-4">
        <p className="text-xs text-muted-foreground">
          Or submit via the web:{" "}
          <Link href="/submit" className="text-foreground hover:underline">
            openaffiliate.dev/submit
          </Link>
        </p>
      </div>
    </div>
  );
}
