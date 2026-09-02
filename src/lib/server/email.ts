import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getMailSettings } from './settings';
import { env } from '$env/dynamic/private';

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
  tls: boolean;
}

/**
 * Whether something can be used as an envelope sender.
 *
 * Loose on purpose — the only test that settles an address is sending to it —
 * but an address with no domain is not a marginal case, it's a rejection. The
 * fallback here used to be the SMTP username, which is an email address at some
 * providers and a bare name at others; when it was a bare name every message
 * failed with `553 The address is not a valid RFC 5321 address` and nothing
 * said why.
 */
function usableFrom(value: string | null | undefined): value is string {
  return !!value && value.includes('@');
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // Stored config first, environment variables as the fallback.
  const mail = await getMailSettings();

  if (mail?.smtpHost && mail?.smtpUser && mail?.smtpPassword) {
    /*
     * The stored address, then the username if it happens to be one, then
     * whatever the environment was started with. A server configured in the
     * admin but missing a From address shouldn't fall back to a value that
     * can't be sent from.
     */
    const from = [mail.smtpFromAddress, mail.smtpUser, env.SMTP_FROM_ADDRESS].find(usableFrom);
    if (!from) return null;

    return {
      host: mail.smtpHost,
      port: mail.smtpPort ?? 587,
      user: mail.smtpUser,
      password: mail.smtpPassword,
      fromAddress: from,
      fromName: mail.smtpFromName ?? 'Artistack',
      tls: mail.smtpTls ?? true
    };
  }

  // Fall back to environment variables
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return {
      host: env.SMTP_HOST,
      port: parseInt(env.SMTP_PORT || '587', 10),
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      fromAddress: env.SMTP_FROM_ADDRESS ?? env.SMTP_USER,
      fromName: env.SMTP_FROM_NAME ?? 'Artistack',
      tls: env.SMTP_TLS !== 'false'
    };
  }

  return null;
}

function createTransporter(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.user,
      pass: config.password
    },
    tls: config.tls ? {} : { rejectUnauthorized: false }
  });
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ success: boolean; error?: string }> {
  const config = await getSmtpConfig();

  if (!config) {
    return {
      success: false,
      error: 'SMTP not configured — check the host, username, password and From address'
    };
  }

  try {
    const transporter = createTransporter(config);

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    });

    return { success: true };
  } catch (error) {
    console.error('Email send failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function testSmtpConnection(): Promise<{ success: boolean; error?: string }> {
  const config = await getSmtpConfig();

  if (!config) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}
