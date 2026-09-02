import { sendEmail } from './email';
import { renderEmail, escapeHtml } from './email-template';
import { getSettings } from './settings';
import { formatPrice } from '$lib/utils/price';
import { withVariant } from '$lib/utils/variants';
import type { Order, OrderItem } from './schema';

/**
 * The email that arrives after paying.
 *
 * It carries the download links, which makes it the thing a buyer keeps — the
 * return page is a tab that gets closed. Written as text with an HTML twin
 * rather than a template: it has to survive a mail client that strips styles,
 * because losing the links loses the purchase.
 */

/** Never throws. A receipt that fails to send must not undo a payment. */
export async function sendReceipt(
  order: Order,
  items: OrderItem[],
  origin: string,
  /**
   * Present when this buyer is on the fan list.
   *
   * A receipt isn't a marketing message, so it needs no unsubscribe to be
   * lawful. It gets one anyway, and only for someone actually on the list: they
   * agreed in a tickbox at checkout, which is easy to forget having done, and
   * the honest thing is to say so where they'll read it and give the way out in
   * the same place.
   */
  unsubscribeToken?: string | null
): Promise<void> {
  try {
    const settings = await getSettings();
    const from = settings?.siteTitle ?? 'the shop';
    const locale = settings?.locale ?? 'nb-NO';
    /*
     * Links have to carry their colour inline. Email clients drop stylesheets,
     * so an unstyled anchor falls back to the browser's default blue — which on
     * a dark receipt is both off-brand and hard to read.
     */
    const accent = settings?.colorAccent ?? '#8b5cf6';
    const money = (minor: number) => formatPrice(minor, order.currency, locale);

    const lines = items.map(
      (item) =>
        `${item.quantity} × ${withVariant(item.name, item.variant)} — ${money(item.unitPrice * item.quantity)}`
    );

    const downloads = items
      .filter((item) => item.downloadToken)
      .map((item) => ({ name: item.name, url: `${origin}/shop/download/${item.downloadToken}` }));

    const posted = items.some((item) => item.type === 'physical');

    const text = [
      `Thanks for buying from ${from}.`,
      '',
      `Order ${order.reference}`,
      ...lines,
      `Total: ${money(order.amount)}`,
      ...(downloads.length
        ? ['', 'Your downloads:', ...downloads.map((d) => `${d.name}: ${d.url}`)]
        : []),
      ...(posted ? ['', "We'll email again when it's posted."] : []),
      '',
      // Not a support address we might not have — the reply goes wherever the
      // site's mail is configured to come from, which is somewhere real.
      'Reply to this email if anything looks wrong.'
    ].join('\n');

    const html = await renderEmail({
      heading: 'Thank you',
      preview: `${order.reference} — ${money(order.amount)}`,
      origin,
      body: [
        `<p style="margin:0 0 16px;">Order <strong>${escapeHtml(order.reference)}</strong></p>`,
        '<ul style="margin:0 0 16px;padding-left:20px;">',
        ...items.map(
          (item) =>
            `<li>${item.quantity} × ${escapeHtml(withVariant(item.name, item.variant))} — ${money(
              item.unitPrice * item.quantity
            )}</li>`
        ),
        '</ul>',
        `<p style="margin:0 0 16px;"><strong>Total: ${money(order.amount)}</strong></p>`,
        ...(downloads.length
          ? [
              '<p style="margin:0 0 8px;"><strong>Your downloads</strong></p><ul style="margin:0 0 16px;padding-left:20px;">',
              ...downloads.map(
                (d) =>
                  `<li style="margin-bottom:4px;"><a href="${d.url}" style="color:${accent};font-weight:600;">${escapeHtml(d.name)}</a></li>`
              ),
              '</ul>'
            ]
          : []),
        ...(posted ? ['<p style="margin:0;">We\'ll email again when it\'s posted.</p>'] : [])
      ].join(''),
      footer: [
        'Reply to this email if anything looks wrong.',
        ...(unsubscribeToken
          ? [
              `You're on the list for news about new releases and merch. <a href="${origin}/unsubscribe/${unsubscribeToken}" style="color:inherit;">Stop any time</a>.`
            ]
          : [])
      ].join('<br><br>')
    });

    await sendEmail({
      to: order.buyerEmail,
      subject: `Order ${order.reference} — ${from}`,
      text,
      html
    });
  } catch (err) {
    // SMTP not configured is the common case on a fresh install, and it isn't
    // worth failing a paid order over — the return page shows the same links.
    console.error('[receipt] could not send', err);
  }
}
