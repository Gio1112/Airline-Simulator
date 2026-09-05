"use client";

import { useEffect, useState } from "react";

const imageCache = new Map<string, string | null>();
const DEFAULT_FALLBACK = "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1400&q=82";

async function wikipediaImage(title: string) {
  const cached = imageCache.get(title);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      imageCache.set(title, null);
      return null;
    }
    const data = await response.json() as { originalimage?: { source?: string }; thumbnail?: { source?: string } };
    const url = data.originalimage?.source ?? data.thumbnail?.source ?? null;
    imageCache.set(title, url);
    return url;
  } catch {
    imageCache.set(title, null);
    return null;
  }
}

export function MediaImage({
  queries,
  alt,
  className = "",
  fallback = DEFAULT_FALLBACK,
  overlay = true,
}: {
  queries: string[];
  alt: string;
  className?: string;
  fallback?: string;
  overlay?: boolean;
}) {
  const [src, setSrc] = useState<string>(fallback);
  const key = queries.join("|");

  useEffect(() => {
    let cancelled = false;
    setSrc(fallback);

    void (async () => {
      for (const query of queries) {
        const image = await wikipediaImage(query);
        if (image) {
          if (!cancelled) setSrc(image);
          return;
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fallback, key]);

  return (
    <div className={`relative overflow-hidden bg-[#24303a] ${className}`}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSrc(fallback)}
      />
      {overlay && <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />}
    </div>
  );
}
