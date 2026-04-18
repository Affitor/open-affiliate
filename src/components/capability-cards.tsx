"use client";

import { useState } from "react";
import { ChevronDown, Wrench, BookOpen, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CapabilitySection {
  id: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  items: { title: string; description?: string }[];
}

interface CapabilityCardsProps {
  tools: { title: string; description?: string }[];
  resources: { title: string; description?: string }[];
  useCases: { title: string; description?: string }[];
}

function Section({ section }: { section: CapabilitySection }) {
  const [open, setOpen] = useState(false);

  if (section.count === 0) return null;

  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center justify-between w-full px-5 py-3.5 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-muted-foreground">{section.icon}</span>
          <span className="text-sm font-medium">{section.label}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 min-w-[1.25rem] justify-center">
            {section.count}
          </Badge>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          {section.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-emerald-500/60 shrink-0" />
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CapabilityCards({ tools, resources, useCases }: CapabilityCardsProps) {
  const sections: CapabilitySection[] = [
    {
      id: "tools",
      label: "Tools",
      count: tools.length,
      icon: <Wrench className="h-3.5 w-3.5" />,
      items: tools,
    },
    {
      id: "resources",
      label: "Resources",
      count: resources.length,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      items: resources,
    },
    {
      id: "use-cases",
      label: "Use Cases",
      count: useCases.length,
      icon: <Lightbulb className="h-3.5 w-3.5" />,
      items: useCases,
    },
  ];

  const totalCount = sections.reduce((sum, s) => sum + s.count, 0);

  if (totalCount === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/30 bg-muted/20">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Capabilities</h3>
          <Badge variant="outline" className="text-[10px]">
            {totalCount}
          </Badge>
        </div>
      </div>
      {sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </div>
  );
}
