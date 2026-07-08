import PdfCompressor from "@/components/PdfCompressor";

export const metadata = {
  title: "PDF Compressor",
  description:
    "Shrink PDF files right in your browser — ideal for scanned " +
    "documents. Your files never leave your device.",
};

export default function PdfCompressPage() {
  return <PdfCompressor />;
}
