import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import ReceiptCard from "@/components/ReceiptCard";
import { getPaidTransaction } from "@/lib/paystack";
import { CONTACT_EMAIL, type Receipt } from "@/lib/receipt";

export const metadata = { title: "Thank You" };

/** Landing spot after a tip — confirms the payment with Paystack
 *  (?reference=...) and offers a shareable receipt image. */
export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { reference } = await searchParams;
  const ref = typeof reference === "string" ? reference : null;

  let receipt: Receipt | null = null;
  if (ref) {
    try {
      receipt = await getPaidTransaction(ref);
    } catch {
      // Paystack unreachable / keys missing — treated as unconfirmed below
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-card px-6 py-12 text-center">
      {ref && !receipt ? (
        <Unconfirmed reference={ref} />
      ) : (
        <>
          <CircleCheck
            className="h-14 w-14 text-green-600 md:h-16 md:w-16"
            strokeWidth={1.5}
          />
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Thank you for your tip
          </h1>
          <p className="max-w-sm text-sm text-muted">
            Your support keeps PageDeck free, offline and ad-free for everyone.
          </p>

          {receipt && (
            <div className="mt-2 w-full max-w-sm">
              <ReceiptCard receipt={receipt} />
            </div>
          )}
        </>
      )}

      <Link
        href="/"
        className="mt-1 text-sm text-muted underline hover:text-foreground hover:no-underline"
      >
        Back to PageDeck
      </Link>
    </main>
  );
}

/** Shown when the reference doesn't match a successful payment. */
function Unconfirmed({ reference }: { reference: string }) {
  return (
    <>
      <CircleAlert
        className="h-14 w-14 text-danger md:h-16 md:w-16"
        strokeWidth={1.5}
      />
      <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        We couldn&apos;t confirm this payment
      </h1>
      <p className="max-w-sm text-sm text-muted">
        If you were charged, email us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Tip%20reference%20${encodeURIComponent(reference)}`}
          className="underline hover:no-underline"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        with your reference and we&apos;ll sort it out:
        <span className="mt-2 block font-mono text-xs text-foreground">
          {reference}
        </span>
      </p>
    </>
  );
}
