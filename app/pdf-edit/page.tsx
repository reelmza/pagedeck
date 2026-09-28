import type { Metadata } from "next";
import PdfEditor from "@/components/editor/PdfEditor";
import { EDITOR_FONT_FAMILIES, EDITOR_FONT_PREVIEWS } from "./fonts";

export const metadata: Metadata = {
  title: "PDF Editor",
  description:
    "Add text, white-out, images and your signature to a PDF right in " +
    "your browser. Your files never leave your device.",
};

export default function PdfEditPage() {
  return <PdfEditor fontFamilies={EDITOR_FONT_FAMILIES} fontPreviews={EDITOR_FONT_PREVIEWS} />;
}
