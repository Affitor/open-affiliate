import Image from "next/image";

import logoFiles from "@/lib/logo-files.json";

interface ProgramLogoProps {
  slug: string;
  name: string;
  size?: number;
  className?: string;
}

export function ProgramLogo({
  slug,
  name,
  size = 40,
  className = "",
}: ProgramLogoProps) {
  // Most logos are <slug>.png. 48 are .jpg, .webp or .svg — hardcoding .png
  // meant those 404'd and rendered as a bare initial instead of the brand
  // mark. The map is generated from the logos directory by build-registry.
  //
  // Server component: a client wrapper around every logo used to put ~20
  // islands on /categories and more on each program page. Letter fallback
  // sits under the image so a missing file still shows an initial, no JS.
  const file = (logoFiles as Record<string, string>)[slug];
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg text-sm font-bold overflow-hidden bg-muted ${className}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center select-none"
        aria-hidden
      >
        {initial}
      </span>
      {file ? (
        <Image
          src={`/logos/${file}`}
          alt={`${name} logo`}
          width={size}
          height={size}
          className="relative z-10 h-full w-full object-contain bg-background"
          unoptimized
        />
      ) : null}
    </div>
  );
}
