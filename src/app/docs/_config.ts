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
      { title: "Affiliate Score", href: "/docs/affiliate-score", description: "How the scoring algorithm ranks programs from 0 to 100." },
    ],
  },
  {
    label: "Guides",
    items: [
      { title: "Content Lab", href: "/docs/content-lab", description: "Generate affiliate content with AI from real program data." },
      { title: "Submit a Program", href: "/docs/submit", description: "Add your affiliate program to the open registry." },
      { title: "What is Open Source?", href: "/docs/open-source", description: "Why the registry is open and what that means for you." },
      { title: "Contributing", href: "/docs/contributing", description: "How to contribute programs, fixes, and features." },
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
