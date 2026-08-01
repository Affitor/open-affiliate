"use client";

import { useState } from "react";

/**
 * Thumbnails come from whatever platform published the content, and a good
 * number of those URLs are dead — TikTok CDN links expire, YouTube thumbs
 * disappear with the video. A plain <img> renders those as an empty grey box,
 * which is most of what a visitor sees on /explore.
 *
 * Falls back to the same placeholder used when there is no thumbnail at all,
 * so a dead link and a missing link look identical instead of broken.
 */
export function ExploreThumbnail({
  src,
  placeholder,
}: {
  src: string | null | undefined;
  placeholder: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="h-16 w-28 rounded-lg bg-muted/50 flex items-center justify-center">
        {placeholder}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-16 w-28 rounded-lg object-cover bg-muted"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
