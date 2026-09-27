"use client";

import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { downloadBlob } from "@/lib/pdf";
import {
  RECEIPT_HEIGHT,
  RECEIPT_WIDTH,
  receiptFileName,
  renderReceipt,
  type Receipt,
} from "@/lib/receipt";

/** Receipt image preview with download / share buttons. The PNG is drawn
 *  once on mount so both buttons act instantly (share sheets need the
 *  click's user gesture, which an await-then-share could lose). */
export default function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    renderReceipt(receipt)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFile(new File([blob], receiptFileName(receipt), { type: "image/png" }));
        setPreview(url);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receipt]);

  // Native share sheet (mostly phones) — only if it accepts image files
  const canShare =
    !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: "My PageDeck tip" });
    } catch {
      // User closed the share sheet — nothing to do
    }
  }

  if (failed) {
    return (
      <p className="text-xs text-danger">
        Couldn&apos;t create your receipt image — please refresh and try again.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* Placeholder keeps the 9:16 shape while the image is drawn */}
      <div
        className="w-full max-w-65 overflow-hidden rounded-2xl border border-border bg-accent-soft/60 shadow-lg"
        style={{ aspectRatio: `${RECEIPT_WIDTH} / ${RECEIPT_HEIGHT}` }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your tip receipt" className="h-full w-full" />
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
          Download receipt
        </button>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="flex items-center gap-2 rounded-full border border-accent/40 px-5 py-2.5 text-sm font-medium text-accent transition-colors hover:bg-accent-soft/60"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
