"use client";

import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginSchema, type LoginInput } from "@interview/shared";
import { signIn } from "@/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams?.get("from") ?? "/dashboard";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    const result = await signIn.email({
      email: data.email,
      password: data.password,
    });

    if (result.error) {
      toast.error(result.error.message ?? "Invalid credentials");
      return;
    }

    toast.success("Welcome back!");
    router.push(from);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 border border-border">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary mb-4">
          <span className="text-primary-foreground font-bold text-xl">I</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Sign in to your account to continue
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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-foreground">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            {...register("password")}
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition"
          />
          {errors.password && (
            <p className="text-destructive text-xs mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="text-primary font-medium hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
