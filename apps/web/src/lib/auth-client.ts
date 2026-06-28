import { createAuthClient } from "better-auth/react";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: AUTH_URL,
});

export const { signIn, signUp, signOut, useSession, resetPassword } = authClient;

/** Direct fetch for forgot-password — Better Auth React client doesn't expose this typed */
export async function forgetPassword(email: string, redirectTo: string) {
  const res = await fetch(`${AUTH_URL}/api/auth/forget-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, redirectTo }),
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: { message: json.message ?? "Request failed" } };
  return { data: json, error: null };
}
