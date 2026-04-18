"use client";

import { useState } from "react";
import Image from "next/image";

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
  const localSrc = `/logos/${slug}.png`;
  const initial = name.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      className={`relative flex items-center justify-center rounded-lg bg-muted text-sm font-bold overflow-hidden ${className}`}
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
