"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ResetPasswordSchema, type ResetPasswordInput } from "@interview/shared";
import { resetPassword } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token },
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    const result = await resetPassword({
      token: data.token,
      newPassword: data.password,
    });

    if (result.error) {
      toast.error(result.error.message ?? "Reset failed. The link may have expired.");
      return;
    }

    toast.success("Password reset! Please sign in.");
    router.push("/login");
  };

  if (!token) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-border text-center">
        <p className="text-destructive font-medium">Invalid reset link.</p>
        <Link href="/forgot-password" className="text-primary text-sm hover:underline mt-4 block">
          Request a new one
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-border">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register("token")} />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            New password
          </label>
          <input
            {...register("password")}
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 chars, with uppercase and number"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
          />
          {errors.password && (
            <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Reset password
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
