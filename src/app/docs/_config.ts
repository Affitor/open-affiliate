export type DocsSidebarItem = {
  title: string;
  href: string;
};

export type DocsSidebarGroup = {
  label: string;
  items: DocsSidebarItem[];
};

export const docsNav: DocsSidebarGroup[] = [
  {
    label: "Getting Started",
    items: [
      { title: "What is OpenAffiliate?", href: "/docs" },
      { title: "Quick Start", href: "/docs/quickstart" },
      { title: "Features", href: "/docs/features" },
    ],
  },
  {
    label: "References",
    items: [
      { title: "CLI", href: "/docs/cli" },
      { title: "REST API", href: "/docs/api" },
      { title: "MCP Server", href: "/docs/mcp" },
      { title: "AI SDK", href: "/docs/ai-sdk" },
      { title: "TypeScript SDK", href: "/docs/sdk" },
      { title: "YAML Schema", href: "/docs/yaml-schema" },
    ],
  },
  {
    label: "Guides",
    items: [
      { title: "Submit a Program", href: "/docs/submit" },
      { title: "What is Open Source?", href: "/docs/open-source" },
      { title: "Contributing", href: "/docs/contributing" },
    ],
  },
];
