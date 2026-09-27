import type { Receipt } from "./receipt";

/** Paystack's verify response — only the fields we read. */
interface PaystackTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number; // subunit (kobo)
  currency: string;
  paid_at: string | null;
  channel: string;
  customer: { email: string; first_name: string | null; last_name: string | null };
  authorization?: { brand?: string; card_type?: string; last4?: string; bank?: string };
  metadata?:
    | { custom_fields?: { variable_name: string; value: string }[] }
    | string
    | null;
}

/** Looks up a transaction with Paystack (server-only — uses the secret
 *  key) and returns receipt details, or null if it isn't a paid one. */
export async function getPaidTransaction(reference: string): Promise<Receipt | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("PAYSTACK_SECRET_KEY is not set");

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" }
  );
  if (!res.ok) return null;

  const tx: PaystackTransaction | undefined = (await res.json())?.data;
  // Paystack's top-level "status" only means the request worked — the
  // payment outcome is data.status
  if (!tx || tx.status !== "success") return null;

  return {
    reference: tx.reference,
    transactionId: String(tx.id),
    amount: tx.amount / 100,
    currency: tx.currency,
    paidAt: formatDate(tx.paid_at),
    name: payerName(tx),
    email: tx.customer.email,
    method: paymentMethod(tx),
  };
}

/** Name typed on the tip form (metadata), falling back to Paystack's
 *  customer record. */
function payerName(tx: PaystackTransaction) {
  const meta = typeof tx.metadata === "object" ? tx.metadata : null;
  const fromForm = meta?.custom_fields?.find((f) => f.variable_name === "name")?.value;
  const fromCustomer = [tx.customer.first_name, tx.customer.last_name]
    .filter(Boolean)
    .join(" ");
  return fromForm || fromCustomer || tx.customer.email;
}

/** e.g. "Visa card ending 4081", "Bank transfer", "USSD". */
function paymentMethod(tx: PaystackTransaction) {
  const auth = tx.authorization;
  if (tx.channel === "card" && auth?.last4) {
    const brand = auth.brand ? capitalize(auth.brand.trim()) + " card" : "Card";
    return `${brand} ending ${auth.last4}`;
  }
  const label = tx.channel.replace(/_/g, " ");
  return tx.channel === "ussd" ? "USSD" : capitalize(label);
}

function formatDate(iso: string | null) {
  const date = iso ? new Date(iso) : new Date();
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(date);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
