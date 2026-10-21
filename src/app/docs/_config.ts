export type DocsSidebarItem = {
  title: string;
  href: string;
  description?: string;
};

export type DocsSidebarGroup = {
  label: string;
  items: DocsSidebarItem[];
};

export const docsNav: DocsSidebarGroup[] = [
  {
    label: "Getting Started",
    items: [
      { title: "What is OpenAffiliate?", href: "/docs", description: "The open registry of affiliate programs. Built for developers and AI agents." },
      { title: "Quick Start", href: "/docs/quickstart", description: "Get up and running in 30 seconds with the CLI, MCP, or REST API." },
      { title: "Features", href: "/docs/features", description: "Search, rankings, voting, compare, badges, and integration options." },
    ],
  },
  {
    label: "References",
    items: [
      { title: "CLI", href: "/docs/cli", description: "Search and manage affiliate programs from your terminal." },
      { title: "REST API", href: "/docs/api", description: "Query the registry with simple HTTP requests. No auth required." },
      { title: "MCP Server", href: "/docs/mcp", description: "Connect AI agents to the registry via Model Context Protocol." },
      { title: "AI SDK", href: "/docs/ai-sdk", description: "Use the Vercel AI SDK to build AI-powered affiliate tools." },
      { title: "TypeScript SDK", href: "/docs/sdk", description: "Typed client for searching and querying programs." },
      { title: "YAML Schema", href: "/docs/yaml-schema", description: "The structure of a program entry in the registry." },
      { title: "OpenAffiliate Score (OAS)", href: "/docs/oas", description: "How a program gets scored and ranked, and how to improve a score." },
      { title: "Affiliate Score", href: "/docs/affiliate-score", description: "The older 0 to 100 score behind the /best list and the badge." },
    ],
  },
  {
    label: "Guides",
    items: [
      { title: "Submit a Program", href: "/docs/submit", description: "Add a program, what we check, and how long it takes." },
      { title: "What is Open Source?", href: "/docs/open-source", description: "Why the registry is open and what that means for you." },
      { title: "Content Scoring (SIFT)", href: "/docs/sift-scoring", description: "How AI scores social content relevance from 0 to 10." },
      { title: "Contributing", href: "/docs/contributing", description: "The rules a program file must pass, and how to correct one." },
    ],
  },
];

/** Flat ordered list of all pages for prev/next navigation */
const allPages = docsNav.flatMap((g) => g.items);

export function getAdjacentPages(href: string): { prev?: DocsSidebarItem; next?: DocsSidebarItem } {
  const idx = allPages.findIndex((p) => p.href === href);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? allPages[idx - 1] : undefined,
    next: idx < allPages.length - 1 ? allPages[idx + 1] : undefined,
  };
}

export function getGroupLabel(href: string): string | undefined {
  for (const group of docsNav) {
    if (group.items.some((item) => item.href === href)) return group.label;
  }
  return undefined;
}
