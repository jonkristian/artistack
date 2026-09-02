import { getSettings } from './settings';
import { readableOn, mixHex } from '$lib/utils/color';
import { db } from './db';
import { profile } from './schema';

/**
 * One layout for every email the site sends.
 *
 * There were three before this, each with its own hand-written markup, and two
 * of them had `#8b5cf6` and `#14101f` typed in — the palette Artistack ships
 * with rather than the one the site actually uses. Any artist who changed their
 * colours got someone else's.
 *
 * Email can't use CSS variables, so the values are resolved here and written
 * into the markup. Tables and inline styles for the same reason: a stylesheet
 * is the first thing a mail client throws away.
 */

type EmailAction = { label: string; url: string };

/** What the layout needs to know about the site, fetched once per email. */
async function siteIdentity() {
  const [settings, [artist]] = await Promise.all([
    getSettings(),
    db.select({ name: profile.name }).from(profile).limit(1)
  ]);

  return {
    // The act's name, not the software's — mail comes from the artist.
    name: settings?.siteTitle || artist?.name || 'Artistack',
    bg: settings?.colorBg ?? '#0c0a14',
    surface: settings?.colorCard ?? '#14101f',
    accent: settings?.colorAccent ?? '#8b5cf6',
    text: settings?.colorText ?? '#f4f4f5',
    muted: settings?.colorTextMuted ?? '#a1a1aa',
    /*
     * Text that sits on the accent — black or white, whichever can be read on
     * it. The web side derives this; here it was white, which is fine for a
     * violet and unreadable on a yellow. Emails can't use the variable, so the
     * same function resolves it to a value.
     */
    onAccent: readableOn(settings?.colorAccent ?? '#8b5cf6'),
    /*
     * A solid edge for the card, blended rather than an alpha hex — eight-digit
     * hex support is uneven in email, and a border that disappears in Outlook is
     * worse than one that's a shade off. This is what stops the card and the
     * page reading as one flat field when a theme sets them close together, the
     * same job the border does on the basket panel.
     */
    line: mixHex(settings?.colorTextMuted ?? '#a1a1aa', settings?.colorCard ?? '#14101f', 0.22)
  };
}

/** The buyer's own words come back to them in some of these. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Wraps content in the site's colours.
 *
 * `body` is trusted markup the caller has already escaped where it needs to be
 * — these are all built server-side from things the site knows.
 */
export async function renderEmail(input: {
  heading: string;
  /**
   * The line an inbox shows beside the subject.
   *
   * Without one, clients scrape the first readable text and you get the site
   * name, then "Thank you", then the order reference, run together as the
   * preview. It's the cheapest thing you can do to make a message look like it
   * was written on purpose.
   */
  preview?: string;
  body: string;
  action?: EmailAction;
  /** Small print under the rule. */
  footer?: string;
  /** For absolute links — an email has no page to be relative to. */
  origin?: string;
}): Promise<string> {
  const site = await siteIdentity();
  const origin = input.origin ?? '';

  /*
   * A button, twice.
   *
   * Outlook renders with Word, which ignores background-color on an anchor — so
   * a styled <a> arrives there as plain link text and stops looking like the
   * thing you press. The VML rectangle is what Outlook draws instead; every
   * other client skips it and takes the table below.
   *
   * Borrowed from the Supabase templates in the other project. The templates
   * themselves weren't worth taking — hardcoded light palette, Go syntax, a
   * dozen auth flows this app doesn't have — but this technique was.
   */
  const button = input.action
    ? `<tr><td align="center" style="padding: 8px 0 24px;">
         <!--[if mso]>
         <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
                      xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${input.action.url}" arcsize="16%" stroke="f"
                      fillcolor="${site.accent}"
                      style="height:44px;v-text-anchor:middle;width:260px;">
           <w:anchorlock/>
           <center style="color:${site.onAccent};font-family:Helvetica,Arial,sans-serif;
                          font-size:15px;font-weight:600;">
             ${escapeHtml(input.action.label)}
           </center>
         </v:roundrect>
         <![endif]-->
         <!--[if !mso]><!-- -->
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
           <tr>
             <td align="center" bgcolor="${site.accent}"
                 style="border-radius:8px;background:${site.accent};">
               <a href="${input.action.url}"
                  style="display:inline-block;padding:13px 26px;color:${site.onAccent};
                         text-decoration:none;font-weight:600;font-size:15px;
                         border-radius:8px;">
                 ${escapeHtml(input.action.label)}
               </a>
             </td>
           </tr>
         </table>
         <!--<![endif]-->
       </td></tr>`
    : '';

  /*
   * A privacy link in the footer, taken from the other project's templates.
   * Every one of these carries somebody's name and address, and the page that
   * says what happens to it should be a click away rather than something you
   * have to go looking for.
   */
  const links = `<a href="${origin}/privacy" style="color:${site.muted};">Privacy</a>`;

  const footer = `<tr><td style="padding-top:24px;border-top:1px solid ${site.line};color:${site.muted};
                      font-size:13px;line-height:1.5;">${
                        input.footer ? `${input.footer}<br><br>` : ''
                      }${links}</td></tr>`;

  /*
   * A table in a table: the outer one paints the background across the whole
   * message, the inner one holds the column to a readable width. Centring with
   * margin alone doesn't survive Outlook.
   */
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <!-- Stops iOS resizing the text of a message it decides is too small. -->
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <!--
      A backstop, not the mechanism. Plenty of clients drop this block, which is
      why every link here also carries its colour inline — but where it does
      survive it catches anything a future email forgets to style, rather than
      letting it fall back to the browser's blue.
    -->
    <style>
      a { color: ${site.accent}; }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${site.bg};">
    <!--
      Hidden, but read by the inbox. The run of zero-width spaces after it stops
      the client reaching past this into the message body for more preview text.
    -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;
                mso-hide:all;font-size:1px;line-height:1px;color:transparent;">
      ${escapeHtml(input.preview ?? '')}
      ${'&#8203;'.repeat(60)}
    </div>
    <!--
      bgcolor as well as the CSS. A third of clients ignore <body> styling and
      some strip background declarations — and on a dark email that means white
      text on a white page, which is not a degraded version of this, it's an
      unreadable one. The attribute survives where the style doesn't.
    -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           bgcolor="${site.bg}" style="background:${site.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <!--
            A width attribute beside max-width: 7% of clients ignore the
            latter, and
            without a number to fall back on the column runs the full width of
            the window. The percentage in the style keeps it shrinking on a
            phone, where the attribute alone would overflow.
          -->
          <table role="presentation" width="520" cellpadding="0" cellspacing="0"
                 bgcolor="${site.surface}"
                 style="width:100%;max-width:520px;background:${site.surface};border-radius:14px;
                        border:1px solid ${site.line};
                        padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',
                        Roboto,Helvetica,Arial,sans-serif;color:${site.text};">
            <tr>
              <td style="padding-bottom:4px;color:${site.muted};font-size:12px;
                         letter-spacing:1.5px;text-transform:uppercase;">
                ${escapeHtml(site.name)}
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;font-size:20px;font-weight:600;color:${site.text};">
                ${escapeHtml(input.heading)}
              </td>
            </tr>
            <tr>
              <td style="font-size:15px;line-height:1.6;color:${site.text};">${input.body}</td>
            </tr>
            ${button}
            ${footer}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** The site's name, for a subject line. */
export async function siteName(): Promise<string> {
  return (await siteIdentity()).name;
}
