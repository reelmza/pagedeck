/** Minimal types for @paystack/inline-js (the package ships none).
 *  Only covers what TipForm uses. */
declare module "@paystack/inline-js" {
  interface CustomField {
    display_name: string;
    variable_name: string;
    value: string;
  }

  interface NewTransactionOptions {
    key: string;
    email: string;
    /** In the currency's subunit (kobo for NGN). */
    amount: number;
    currency?: string;
    firstName?: string;
    lastName?: string;
    reference?: string;
    metadata?: { custom_fields?: CustomField[]; [key: string]: unknown };
    onSuccess?: (tx: { id: number; reference: string; message: string }) => void;
    onCancel?: () => void;
    onError?: (error: { message: string }) => void;
    onLoad?: (res: { id: number; accessCode: string }) => void;
  }

  export default class PaystackPop {
    newTransaction(options: NewTransactionOptions): unknown;
  }
}
