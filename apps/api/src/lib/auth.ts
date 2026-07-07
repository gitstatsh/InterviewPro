import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { Resend } from "resend";
import { prisma } from "./prisma.js";
import { env } from "../config/env.js";
import { resolveInviteCapture } from "./invite-capture.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.FRONTEND_URL],
  // When the web app and API live on different subdomains (e.g. app./api.),
  // share the session cookie across the parent domain. Requires HTTPS.
  ...(env.COOKIE_DOMAIN
    ? {
        advanced: {
          crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
          defaultCookieAttributes: { sameSite: "none" as const, secure: true },
        },
      }
    : {}),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      // If this reset was triggered as part of an invite, hand the URL back
      // to the invite flow instead of sending a generic reset email
      if (resolveInviteCapture(user.email, url)) return;

      if (env.RESEND_API_KEY) {
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
          from: `Interview Platform <${env.FROM_EMAIL ?? "onboarding@resend.dev"}>`,
          to: env.EMAIL_OVERRIDE_TO ?? user.email,
          subject: "Reset your password",
          html: `
            <p>Hi ${user.name ?? "there"},</p>
            <p>Click the link below to reset your password. This link expires in 1 hour.</p>
            <p><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a></p>
            <p>If you didn't request this, you can ignore this email.</p>
          `,
        });
      } else {
        console.log(`Password reset link for ${user.email}: ${url}`);
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min client-side cache
    },
  },
  user: {
    additionalFields: {},
  },
});

export type Auth = typeof auth;
