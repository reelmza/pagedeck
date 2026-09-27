import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import ReceiptDownload from "@/components/ReceiptDownload";
import { getPaidTransaction } from "@/lib/paystack";
import { CONTACT_EMAIL, type Receipt } from "@/lib/receipt";

export const metadata = { title: "Thank You" };

/** Landing spot after a tip — confirms the payment with Paystack
 *  (?reference=...) and offers a downloadable receipt. */
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

          {receipt && <ReceiptSummary receipt={receipt} />}
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

const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
});

/** On-page summary of the payment plus the PDF download. */
function ReceiptSummary({ receipt }: { receipt: Receipt }) {
  const rows: [string, string][] = [
    ["Name", receipt.name],
    ["Email", receipt.email],
    ["Date", receipt.paidAt],
    ["Method", receipt.method],
    ["Reference", receipt.reference],
  ];

  return (
    <div className="mt-2 w-full max-w-sm space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm">
        <p className="text-xs text-muted">Amount paid</p>
        <p className="mt-0.5 text-2xl font-bold text-accent">
          {receipt.currency === "NGN"
            ? naira.format(receipt.amount)
            : `${receipt.currency} ${receipt.amount.toLocaleString()}`}
        </p>
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <ReceiptDownload receipt={receipt} />
    </div>
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
