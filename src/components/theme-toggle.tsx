"use client";

import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1">
        <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-7 w-7 rounded-md bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
      {[
        { value: "system", icon: Monitor, label: "System" },
        { value: "light", icon: Sun, label: "Light" },
        { value: "dark", icon: Moon, label: "Dark" },
      ].map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={label}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            theme === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground/50 hover:text-muted-foreground"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
