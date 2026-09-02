import { sendEmail } from './email';
import { renderEmail } from './email-template';

/**
 * The emails this app sends, one function each.
 *
 * Named rather than written inline where they happen to be triggered. The
 * password reset lived inside the auth plugin's callback, which meant nothing
 * else could send one — so there was no way to look at it without asking for a
 * reset, and no way to check the branding after changing a colour.
 */

/** The one-time code for a forgotten password. */
export async function sendPasswordResetEmail(to: string, otp: string) {
  const html = await renderEmail({
    heading: 'Password reset',
    preview: 'Your one-time code, good for ten minutes.',
    body: `
      <p style="margin:0 0 12px;">Your password reset code is:</p>
      <div style="text-align:center;font-size:30px;letter-spacing:8px;font-weight:600;padding:12px 0;">${otp}</div>`,
    footer:
      'This code expires in ten minutes. If you did not ask for it, you can ignore this email.'
  });

  return sendEmail({
    to,
    subject: 'Password reset code',
    text: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
    html
  });
}

/**
 * One of each, to whoever asked for them.
 *
 * A real feature rather than a test harness: it answers "does SMTP work" and
 * "what do these look like in my colours" in one go, and it does it by calling
 * the same senders production uses, so a preview can't drift from the thing it
 * previews.
 *
 * The order it renders is never written down. Nothing here touches the
 * database — a sample must not put a sale in your books or an address on your
 * fan list.
 */
export async function sendSampleEmails(
  to: string,
  origin: string
): Promise<{ sent: string[]; failed: string[] }> {
  const { sendReceipt } = await import('./receipt');
  const { sendInviteEmail } = await import('./invites');

  const sent: string[] = [];
  const failed: string[] = [];

  const attempt = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
      sent.push(label);
    } catch {
      failed.push(label);
    }
  };

  const now = new Date();

  /* A parcel: an option, a posting line, and the fan-list footer. */
  await attempt('Receipt — something to post', () =>
    sendReceipt(
      {
        id: 0,
        reference: 'AS-SAMPLE0001',
        buyerName: 'Sample Buyer',
        buyerEmail: to,
        buyerPhone: null,
        addressLine: 'Nedre Sjetnhaugan 12b',
        postcode: '7081',
        city: 'Sjetnmarka',
        country: 'Norway',
        provider: 'sample',
        providerReference: null,
        paymentStatus: 'authorised',
        fulfilment: 'none',
        amount: 54800,
        currency: 'NOK',
        note: null,
        marketingOptIn: true,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 0,
          orderId: 0,
          productId: null,
          name: 'Tour T-Shirt (Black)',
          unitPrice: 29900,
          quantity: 1,
          variant: 'M',
          type: 'physical',
          fileUrl: null,
          downloadToken: null
        },
        {
          id: 1,
          orderId: 0,
          productId: null,
          name: 'I Will Be Me — 7" Vinyl',
          unitPrice: 24900,
          quantity: 1,
          variant: null,
          type: 'physical',
          fileUrl: null,
          downloadToken: null
        }
      ],
      origin,
      // A token that leads nowhere, so a sample can't unsubscribe anyone.
      'sample-token-not-a-real-one'
    )
  );

  /* A download: charged at once, delivered by link, nothing to post. */
  await attempt('Receipt — a download', () =>
    sendReceipt(
      {
        id: 0,
        reference: 'AS-SAMPLE0002',
        buyerName: 'Sample Buyer',
        buyerEmail: to,
        buyerPhone: null,
        addressLine: null,
        postcode: null,
        city: null,
        country: null,
        provider: 'sample',
        providerReference: null,
        paymentStatus: 'captured',
        fulfilment: 'none',
        amount: 5000,
        currency: 'NOK',
        note: null,
        marketingOptIn: false,
        createdAt: now,
        updatedAt: now
      },
      [
        {
          id: 0,
          orderId: 0,
          productId: null,
          name: 'I Will Be Me — WAV',
          unitPrice: 5000,
          quantity: 1,
          variant: null,
          type: 'digital',
          fileUrl: null,
          downloadToken: 'sample-download-token'
        }
      ],
      origin,
      null
    )
  );

  await attempt('Invite to the admin', () =>
    sendInviteEmail(to, 'Sample Person', `${origin}/login?invite=sample`)
  );

  /* The nudge a week later, which otherwise takes a week to lay eyes on. */
  await attempt('Invite reminder', () =>
    sendInviteEmail(to, 'Sample Person', `${origin}/login?invite=sample`, true)
  );

  await attempt('Password reset code', () => sendPasswordResetEmail(to, '482913'));

  return { sent, failed };
}
