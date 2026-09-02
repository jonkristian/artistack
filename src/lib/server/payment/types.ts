import type { Order, OrderItem, PaymentStatus } from '$lib/server/schema';

/**
 * What a payment provider has to be able to do.
 *
 * Deliberately small. Each provider has its own vocabulary — Vipps talks about
 * references and webhooks, PayPal about orders and captures — and this is the
 * seam where that stops mattering to the shop.
 */

export type PaymentSession = {
  /** The provider's id for this payment, stored so a webhook can be matched. */
  reference: string;
  /** Where to send the buyer. */
  url: string;
  expiresAt: Date;
};

export type WebhookEvent = {
  /** Our order reference, which we put in the payment and get back here. */
  orderReference: string;
  providerReference: string;
  status: PaymentStatus;
};

export type PaymentProvider = {
  readonly name: string;

  /**
   * Reserve the money and return somewhere to send the buyer.
   *
   * `capture` says whether to take it now or hold it: a download is delivered
   * immediately so it can be charged immediately, but a parcel shouldn't be
   * charged until it's posted.
   */
  initialize(input: {
    order: Order;
    items: OrderItem[];
    returnUrl: string;
    capture: boolean;
  }): Promise<PaymentSession>;

  /** Ask the provider what actually happened, rather than trusting a redirect. */
  status(providerReference: string): Promise<PaymentStatus>;

  /** Take money that was only reserved. */
  capture(providerReference: string, amount: number, currency: string): Promise<void>;

  parseWebhook(payload: unknown): WebhookEvent | null;
};
