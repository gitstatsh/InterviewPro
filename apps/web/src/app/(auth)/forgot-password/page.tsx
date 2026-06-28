"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@interview/shared";
import { forgetPassword } from "@/lib/auth-client";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    const result = await forgetPassword(data.email, "/reset-password");

    if (result.error) {
      toast.error(result.error.message ?? "Something went wrong");
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-border text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-4">
          <span className="text-green-600 text-xl">✓</span>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Check your inbox</h1>
        <p className="text-muted-foreground text-sm">
          If an account exists for that email, you&apos;ll receive a password reset link
          shortly.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-primary text-sm font-medium hover:underline mt-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-border">
      <div className="mb-8">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground transition mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to login
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Forgot password?</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Email address
          </label>
          <input
            {...register("email")}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
          />
          {errors.email && (
            <p className="text-destructive text-xs mt-1">{errors.email.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Send reset link
        </button>
      </form>
    </div>
  );
}
