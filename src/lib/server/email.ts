import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { db } from './db';
import { settings } from './schema';
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

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  // Try database settings first
  const [siteSettings] = await db.select().from(settings).limit(1);

  if (siteSettings?.smtpHost && siteSettings?.smtpUser && siteSettings?.smtpPassword) {
    return {
      host: siteSettings.smtpHost,
      port: siteSettings.smtpPort ?? 587,
      user: siteSettings.smtpUser,
      password: siteSettings.smtpPassword,
      fromAddress: siteSettings.smtpFromAddress ?? siteSettings.smtpUser,
      fromName: siteSettings.smtpFromName ?? 'Artistack',
      tls: siteSettings.smtpTls ?? true
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
    return { success: false, error: 'SMTP not configured' };
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
