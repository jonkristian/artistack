import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';
import { db } from './db';
import { sendEmail } from './email';
import { sendPasswordResetEmail } from './emails';
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

        const result = await sendPasswordResetEmail(email, otp);

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
