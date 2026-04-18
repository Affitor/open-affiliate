import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs-sidebar";
import { docsNav } from "./_config";

export const metadata: Metadata = {
  title: {
    template: "%s — Docs | OpenAffiliate",
    default: "Documentation — OpenAffiliate",
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl flex min-h-[calc(100vh-3.5rem)]">
      <DocsSidebar nav={docsNav} />
      <article className="flex-1 min-w-0 px-6 md:px-10 py-10 max-w-3xl">
        {children}
      </article>
    </div>
  );
}
