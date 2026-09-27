"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { downloadReceipt, type Receipt } from "@/lib/receipt";

/** Generates the PDF receipt in the browser on click. */
export default function ReceiptDownload({ receipt }: { receipt: Receipt }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setBusy(true);
    setFailed(false);
    try {
      await downloadReceipt(receipt);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-wait disabled:opacity-70"
      >
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download receipt
      </button>
      {failed && (
        <p className="text-xs text-danger">
          Couldn&apos;t create the receipt — please try again.
        </p>
      )}
    </div>
  );
}
