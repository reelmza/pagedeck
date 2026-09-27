"use client";

import { useEffect, useState } from "react";
import { Award, Download, ReceiptText } from "lucide-react";
import { downloadBlob } from "@/lib/pdf";
import { badgeFileName, renderBadge } from "@/lib/badge";
import {
  RECEIPT_HEIGHT,
  RECEIPT_WIDTH,
  receiptFileName,
  renderReceipt,
  type Receipt,
} from "@/lib/receipt";

type View = "receipt" | "badge";

/** One preview spot that flips between the receipt and the supporter
 *  badge. "Download" saves whichever is in view. Both PNGs are drawn once
 *  on mount so flipping and downloading are instant. */
export default function TipImages({ receipt }: { receipt: Receipt }) {
  const [view, setView] = useState<View>("receipt");
  const [files, setFiles] = useState<Record<View, File> | null>(null);
  const [previews, setPreviews] = useState<Record<View, string> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;

    Promise.all([renderReceipt(receipt), renderBadge(receipt)])
      .then(([receiptPng, badgePng]) => {
        if (cancelled) return;
        const png = (blob: Blob, name: string) => new File([blob], name, { type: "image/png" });
        const next = {
          receipt: png(receiptPng, receiptFileName(receipt)),
          badge: png(badgePng, badgeFileName(receipt)),
        };
        urls = [URL.createObjectURL(next.receipt), URL.createObjectURL(next.badge)];
        setFiles(next);
        setPreviews({ receipt: urls[0], badge: urls[1] });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [receipt]);

  if (failed) {
    return (
      <p className="text-xs text-danger">
        Couldn&apos;t create your receipt — please refresh and try again.
      </p>
    );
  }

  const other: View = view === "receipt" ? "badge" : "receipt";
  const file = files?.[view];

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Receipt and badge share a size, so the frame never jumps */}
      <div
        className="w-full max-w-80 overflow-hidden rounded-2xl border border-border bg-accent-soft/60 shadow-lg"
        style={{ aspectRatio: `${RECEIPT_WIDTH} / ${RECEIPT_HEIGHT}` }}
      >
        {previews ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={view}
            src={previews[view]}
            alt={view === "receipt" ? "Your tip receipt" : "Your supporter badge"}
            className="h-full w-full animate-[fade-in_0.3s_ease-out]"
          />
        ) : (
          <div className="h-full w-full animate-pulse" />
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={!file}
          onClick={() => file && downloadBlob(file, file.name)}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70"
        >
          <Download className="h-4 w-4" />
          Download
        </button>
        <button
          type="button"
          disabled={!previews}
          onClick={() => setView(other)}
          className="flex items-center gap-2 rounded-full border border-accent/40 px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/60 disabled:opacity-60"
        >
          {other === "badge" ? (
            <Award className="h-4 w-4" />
          ) : (
            <ReceiptText className="h-4 w-4" />
          )}
          View {other}
        </button>
      </div>
    </div>
  );
}
