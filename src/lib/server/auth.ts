import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { db } from './db';
import { sendEmail } from './email';
import { env } from '$env/dynamic/private';

// Base URL for auth callbacks - defaults to localhost for development
const baseURL = env.BETTER_AUTH_BASE_URL || 'http://localhost:5173';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite'
  }),
  baseURL,
  secret: env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true
  },
  trustedOrigins: [baseURL],
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'forget-password') return;

        const result = await sendEmail({
          to: email,
          subject: 'Password Reset Code',
          text: `Your password reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
          html: `
						<div style="font-family: sans-serif; max-width: 400px; margin: 0 auto;">
							<h2 style="color: #8b5cf6;">Password Reset</h2>
							<p>Your password reset code is:</p>
							<div style="background: #14101f; color: #fff; padding: 16px; text-align: center; font-size: 32px; letter-spacing: 8px; border-radius: 8px; margin: 16px 0;">
								${otp}
							</div>
							<p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
							<p style="color: #666; font-size: 14px;">If you did not request this, please ignore this email.</p>
						</div>
					`
        });

        if (!result.success) {
          console.error('Failed to send OTP email:', result.error);
          throw new Error(
            result.error === 'SMTP not configured'
              ? 'Email not configured. Contact the site administrator.'
              : 'Failed to send verification email'
          );
        }
      },
      otpLength: 6,
      expiresIn: 600
    })
  ]
});
