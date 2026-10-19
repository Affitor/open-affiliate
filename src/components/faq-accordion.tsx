import { ChevronDown } from "lucide-react";

export function FaqAccordion({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="border-t border-border">
      {items.map((item) => (
        <details key={item.q} className="group border-b border-border py-3.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <p className="text-sm text-muted-foreground mt-2">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
