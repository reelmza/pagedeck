"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCachedThumb, requestThumb } from "@/lib/pdf";

type Props = {
  fileId: string;
  pageIndex: number;
};

/**
 * Presentational page preview. Cards are already virtualized (only
 * mounted near the viewport), so this just asks the render queue for
 * its image. A short debounce means pages flung past during fast
 * scrolling never even enter the priority queue.
 */
export default function PageThumbnail({ fileId, pageIndex }: Props) {
  const [url, setUrl] = useState<string | null>(() => getCachedThumb(fileId, pageIndex));

  useEffect(() => {
    if (url) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      requestThumb(fileId, pageIndex)
        .then((u) => !cancelled && setUrl(u))
        .catch(() => {}); // file was removed mid-render — nothing to show
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fileId, pageIndex, url]);

  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md bg-white">
      {url ? (
        // Plain <img>: thumbnails are local blob URLs, next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Page ${pageIndex + 1}`}
          className="max-h-full max-w-full object-contain"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-muted/50" />
      )}
    </div>
  );
}
