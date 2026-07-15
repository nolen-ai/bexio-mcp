/**
 * Banking resources: bank accounts (3.0) and payments (4.0).
 *
 * Covers operations tagged "Bank Accounts" and "Payments" in the bexio API docs
 * (https://docs.bexio.com/#tag/Bank-Accounts, https://docs.bexio.com/#tag/Payments).
 */
import type { BexioHttp } from '../http.js';
import type { SuccessResponse } from '../types.js';

/** A configured bank account. Read-only via the API. */
export interface BankAccount {
  id: number;
  name: string;
  owner: string;
  owner_address: string;
  owner_house_number: string;
  owner_zip: string;
  owner_city: string;
  owner_country_code: string;
  /** Bank clearing number. */
  bc_nr: string;
  bank_name: string;
  /** BIC / SWIFT code. */
  bank_nr: string;
  bank_account_nr: string;
  iban_nr: string;
  /** References a currency object (embeddable with keyword "currency"). */
  currency_id: number;
  /** References an account object (embeddable with keyword "account"). */
  account_id: number;
  remarks: string;
  qr_invoice_iban: string;
  invoice_mode: 'none' | 'qr_iban' | 'iban_with_creditor_reference' | 'iban_only';
  is_esr: boolean;
  esr_besr_id: string;
  esr_post_account_nr: string;
  esr_payment_for_text: string;
  esr_in_favour_of_text: string;
  /** Always "bank" for this resource. */
  type: string;
}

export type PaymentStatus = 'open' | 'transmitted' | 'downloaded' | 'paid' | 'failed' | 'cancelled';
export type PaymentType = 'iban' | 'qr';
export type PaymentAllowance = 'fee_paid_by_payer' | 'fee_paid_by_payee' | 'fee_split' | 'no_fee';

export interface PaymentRecipientAddress {
  street_name: string;
  house_number: string | null;
  zip: string;
  city: string;
  /** Country code according to ISO 3166-1 alpha-2. */
  country_code: string;
}

export interface PaymentRecipient {
  /** Name of the bank account owner (individual or legal entity). */
  name: string;
  /** IBAN according to ISO 13616. */
  iban: string;
  address: PaymentRecipientAddress;
}

/** A bank payment (4.0 API). */
export interface Payment {
  id: number;
  uuid: string;
  sender: { id: number; uuid: string; iban: string };
  recipient: PaymentRecipient;
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** ISO 8601 date on which the payment should be carried out. */
  execution_date: string;
  allowance?: PaymentAllowance;
  is_salary: boolean;
  instruction_id?: string;
  purchase_reference?: { bill_id?: string; bill_payment_id?: string };
  /** Document number of the linked purchase bill; empty when there is none. */
  document_no?: string;
  /** QR IBAN or SCOR reference number; SCOR starts with "RF". */
  qr_reference_number?: string | null;
  additional_information?: string | null;
  status: PaymentStatus;
  type: PaymentType;
  due_date?: string;
  created_at?: string;
  /** When true, only the API client that created the payment may edit it. */
  is_editing_restricted?: boolean | null;
}

export interface PaymentCreate {
  /** UUID of the sender bank account. */
  account_id: string;
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** ISO 8601 execution date. */
  execution_date: string;
  is_salary: boolean | null;
  recipient: PaymentRecipient;
  type: PaymentType;
  allowance?: PaymentAllowance;
  /** QR reference number or creditor reference number (required for QR payments). */
  qr_reference_nr?: string;
  /** Additional information printed on the payment slip. */
  additional_information?: string;
  purchase_reference?: { bill_id?: string; bill_payment_id?: string };
  is_editing_restricted?: boolean;
  /** Multiline description of the payment. */
  message?: string | null;
}

/**
 * Fields accepted by the update endpoint (spec `UpdatePaymentsRequest`/`PaymentUpdate`).
 * Unlike the create body, the sender bank account (`account_id`), the payment `type`
 * and the `purchase_reference` link cannot be changed on an existing payment.
 */
export type PaymentUpdate = Partial<
  Pick<
    PaymentCreate,
    | 'allowance'
    | 'amount'
    | 'currency'
    | 'execution_date'
    | 'is_salary'
    | 'recipient'
    | 'qr_reference_nr'
    | 'additional_information'
    | 'is_editing_restricted'
    | 'message'
  >
>;

export interface ListPaymentsParams {
  /**
   * Filter expression, e.g. `status_open` or ranges separated by `;`
   * (see https://docs.bexio.com/#operation/NewFetchAllPayments).
   */
  'filter-by'?: string;
  /** Page number (pagination); the first page is 0 (API default). */
  page?: number;
  /** Results per page (default 500, max 2000). */
  'per-page'?: number;
}

export class BankingApi {
  constructor(private readonly http: BexioHttp) {}

  /**
   * Fetch a list of bank accounts.
   * @see ListBankAccounts — scope `bank_account_show`
   */
  listBankAccounts(params?: { limit?: number; offset?: number }): Promise<BankAccount[]> {
    return this.http.get('/3.0/banking/accounts', { query: { ...params } });
  }

  /**
   * Fetch a single bank account.
   * @see ShowBankAccount — scope `bank_account_show`
   */
  getBankAccount(bankAccountId: number): Promise<BankAccount> {
    return this.http.get(`/3.0/banking/accounts/${bankAccountId}`);
  }

  /**
   * Fetch a list of all payments.
   *
   * Deliberate deviation from the OpenAPI spec: the spec declares the 200 response
   * as a single `PaymentView` object, but the endpoint is a list ("Fetch a list of
   * all payments", X-Limit/X-Offset/X-Total-Count pagination headers) and the live
   * API returns an array — the spec schema is treated as a typo.
   * @see NewFetchAllPayments — scope `bank_payment_show`
   */
  listPayments(params?: ListPaymentsParams): Promise<Payment[]> {
    return this.http.get('/4.0/banking/payments', { query: { ...params } });
  }

  /**
   * Get a payment.
   * @see NewGetPayment — scope `bank_payment_show`
   */
  getPayment(paymentId: string): Promise<Payment> {
    return this.http.get(`/4.0/banking/payments/${encodeURIComponent(paymentId)}`);
  }

  /**
   * Create a payment (IBAN or QR).
   * @see NewCreatePayment — scope `bank_payment_edit`
   */
  createPayment(payment: PaymentCreate): Promise<Payment> {
    return this.http.post('/4.0/banking/payments', { body: payment });
  }

  /**
   * Update a payment that is still open.
   * @see NewUpdatePayment — scope `bank_payment_edit`
   */
  updatePayment(paymentId: string, payment: PaymentUpdate): Promise<Payment> {
    return this.http.put(`/4.0/banking/payments/${encodeURIComponent(paymentId)}`, { body: payment });
  }

  /**
   * Delete a payment.
   * @see NewDeletePayment — scope `bank_payment_edit`
   */
  deletePayment(paymentId: string): Promise<SuccessResponse> {
    return this.http.delete(`/4.0/banking/payments/${encodeURIComponent(paymentId)}`);
  }

  /**
   * Cancel a transmitted/downloaded payment. Cancelling cannot be undone.
   * @see NewCancelPayment — scope `bank_payment_edit`
   */
  cancelPayment(paymentId: string): Promise<Payment> {
    return this.http.post(`/4.0/banking/payments/${encodeURIComponent(paymentId)}/cancel`);
  }
}

/** Operation IDs of the bexio API covered by {@link BankingApi} (used by coverage tests). */
export const bankingOperations = [
  'ListBankAccounts',
  'ShowBankAccount',
  'NewFetchAllPayments',
  'NewGetPayment',
  'NewCreatePayment',
  'NewUpdatePayment',
  'NewDeletePayment',
  'NewCancelPayment',
] as const;
