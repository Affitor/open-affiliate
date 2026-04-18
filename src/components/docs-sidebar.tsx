"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { DocsSidebarGroup } from "@/app/docs/_config";

export function DocsSidebar({ nav }: { nav: DocsSidebarGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav className="space-y-6">
      {nav.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2 px-3">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-muted/50 text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-border/30 py-8 pr-4 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
        {sidebar}
      </aside>

      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 left-4 z-40 md:hidden flex items-center justify-center h-10 w-10 rounded-full bg-foreground text-background shadow-lg"
        aria-label="Toggle docs menu"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed top-14 left-0 bottom-0 z-40 w-64 bg-background border-r border-border/30 p-6 overflow-y-auto md:hidden">
            {sidebar}
          </aside>
        </>
      )}
    </>
  );
}
