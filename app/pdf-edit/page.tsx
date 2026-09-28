import type { Metadata } from "next";
import { Dancing_Script } from "next/font/google";
import PdfEditor from "@/components/editor/PdfEditor";

export const metadata: Metadata = {
  title: "PDF Editor",
  description:
    "Add text, white-out, images and your signature to a PDF right in " +
    "your browser. Your files never leave your device.",
};

// Handwriting font for typed signatures — only fetched once it's used
const signatureFont = Dancing_Script({ subsets: ["latin"], weight: "600", preload: false });

export default function PdfEditPage() {
  return <PdfEditor handwritingFont={signatureFont.style.fontFamily} />;
}
