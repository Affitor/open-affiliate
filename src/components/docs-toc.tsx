"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { List } from "lucide-react";

type Heading = { id: string; text: string; level: number };

export function DocsToc() {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const article = document.querySelector("article");
    if (!article) return;

    const els = article.querySelectorAll("h2[id], h3[id]");
    const items: Heading[] = Array.from(els).map((el) => ({
      id: el.id,
      text: el.textContent?.trim() ?? "",
      level: el.tagName === "H3" ? 3 : 2,
    }));
    requestAnimationFrame(() => {
      setHeadings(items);
      setActiveId(items[0]?.id ?? "");
    });

    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );
    observerRef.current = observer;
    els.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [pathname]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-[16.5rem] shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-8 pl-8">
      <div className="text-sm">
        <p className="font-medium text-foreground flex items-center gap-2 mb-3">
          <List className="h-3.5 w-3.5" />
          On this page
        </p>
        <ul className="space-y-1">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className={`block py-1 transition-colors ${
                  h.level === 3 ? "pl-3" : ""
                } ${
                  activeId === h.id
                    ? "text-emerald-700 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
