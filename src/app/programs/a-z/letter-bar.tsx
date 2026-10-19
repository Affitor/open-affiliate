"use client";

/**
 * The letter jump bar. A plain #letter link adds a history entry Next has no
 * state for (jump, open a program, Back left the program page on screen, N-2),
 * so with JavaScript the bar scrolls without touching history; the href keeps
 * it working without JavaScript.
 */
export function LetterBar({ letters }: { letters: { id: string; label: string }[] }) {
  return (
    <nav aria-label="Jump to letter" className="flex flex-wrap gap-1">
      {letters.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => {
            const target = document.getElementById(id);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ block: "start" });
            target.focus({ preventScroll: true });
          }}
          className="grid h-8 min-w-8 place-items-center rounded-md border border-line-strong bg-card px-1.5 font-mono text-xs uppercase hover:bg-sunk"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
