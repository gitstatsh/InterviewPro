import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  EMAIL_OVERRIDE_TO: z.string().email().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // COBRA (Code OBserver and Risk Analytics) — POC test-mode coverage capture.
  // Never set TEST_MODE=1 in production; it exposes /__coverage__/* endpoints.
  TEST_MODE: z.enum(["0", "1"]).default("0"),
  COBRA_ENABLED: z.enum(["0", "1"]).default("0"),
  COBRA_AUTO_RUN: z.enum(["0", "1"]).default("0"),
  COBRA_TOKEN: z.string().optional(),
  COBRA_STORAGE_DIR: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
