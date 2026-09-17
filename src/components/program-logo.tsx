"use client";

import { useState } from "react";
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
  const file = (logoFiles as Record<string, string>)[slug] ?? `${slug}.png`;
  const localSrc = `/logos/${file}`;
  const initial = name.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg text-sm font-bold overflow-hidden ${imgLoaded && !imgError ? "" : "bg-muted"} ${className}`}
      style={{ width: size, height: size }}
    >
      {(!imgLoaded || imgError) && (
        <span className="absolute inset-0 flex items-center justify-center select-none">
          {initial}
        </span>
      )}
      {!imgError && (
        <Image
          src={localSrc}
          alt={`${name} logo`}
          width={size}
          height={size}
          className="absolute inset-0 object-contain"
          unoptimized
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}
