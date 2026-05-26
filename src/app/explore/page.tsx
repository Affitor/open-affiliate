import { Suspense } from "react";
import { connection } from "next/server";
import { Metadata } from "next";
import { fetchExploreData, fetchPlatformCounts } from "@/lib/social-explore";
import { ExploreFilters } from "@/components/explore-filters";
import { ExploreTable } from "@/components/explore-table";

export const metadata: Metadata = {
  title: "Explore Affiliate Content — OpenAffiliate",
  description:
    "Discover top-performing affiliate content across YouTube, TikTok, Reddit, and blogs. Find successful patterns to replicate.",
};

interface ExplorePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function ExploreShell() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Explore Affiliate Content
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover top-performing content across platforms. Find patterns that work.
        </p>
      </div>
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded-lg bg-muted/30" />
        <div className="h-10 rounded-lg bg-muted/30" />
        <div className="h-64 rounded-lg bg-muted/30" />
      </div>
    </main>
  );
}

async function ExploreContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;

  const platform =
    typeof params.platform === "string" ? params.platform : undefined;
  const category =
    typeof params.category === "string" ? params.category : undefined;
  const timeRange =
    typeof params.time === "string" ? params.time : undefined;
  const sort = typeof params.sort === "string" ? params.sort : "quality";
  const quality =
    typeof params.quality === "string" ? params.quality : "3";
  const q = typeof params.q === "string" ? params.q : undefined;
  const page =
    typeof params.page === "string" ? parseInt(params.page, 10) : 1;

  const [data, platformCounts] = await Promise.all([
    fetchExploreData({ platform, category, timeRange, sort, quality, q, page }),
    fetchPlatformCounts(),
  ]);

  const totalPages = Math.ceil(data.total / data.pageSize);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Explore Affiliate Content
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Discover top-performing content across platforms. Find patterns that
          work.
        </p>
      </div>

      <div className="mb-4 flex justify-end">
        <a
          href="/explore/stats"
          className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          Content Insights
        </a>
      </div>

      <Suspense fallback={null}>
        <ExploreFilters
          categories={data.categories}
          platformCounts={platformCounts}
          total={data.total}
        />
      </Suspense>

      <div className="mt-6">
        <ExploreTable items={data.items} />
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {data.page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {data.page > 1 && (
              <PaginationLink
                page={data.page - 1}
                params={params}
                label="Previous"
              />
            )}
            {data.page < totalPages && (
              <PaginationLink
                page={data.page + 1}
                params={params}
                label="Next"
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function PaginationLink({
  page,
  params,
  label,
}: {
  page: number;
  params: Record<string, string | string[] | undefined>;
  label: string;
}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) sp.set(key, value);
  }
  sp.set("page", String(page));

  return (
    <a
      href={`/explore?${sp.toString()}`}
      className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      {label}
    </a>
  );
}

export default function ExplorePage({ searchParams }: ExplorePageProps) {
  return (
    <Suspense fallback={<ExploreShell />}>
      <ExploreContent searchParams={searchParams} />
    </Suspense>
  );
}
