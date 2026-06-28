import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from "@interview/shared";

describe("RegisterSchema", () => {
  it("accepts valid registration data", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "SecurePass1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short name", () => {
    const result = RegisterSchema.safeParse({
      name: "J",
      email: "jane@example.com",
      password: "SecurePass1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.name).toBeDefined();
  });

  it("rejects invalid email", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Smith",
      email: "not-an-email",
      password: "SecurePass1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.email).toBeDefined();
  });

  it("rejects password without uppercase", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "nouppercase1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.password).toBeDefined();
  });

  it("rejects password without number", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "NoNumberHere",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 chars", () => {
    const result = RegisterSchema.safeParse({
      name: "Jane Smith",
      email: "jane@example.com",
      password: "Ab1",
    });
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = LoginSchema.safeParse({
      email: "jane@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email: "jane@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ForgotPasswordSchema", () => {
  it("accepts valid email", () => {
    expect(ForgotPasswordSchema.safeParse({ email: "user@test.com" }).success).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(ForgotPasswordSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
});

describe("ResetPasswordSchema", () => {
  it("accepts valid token and strong password", () => {
    const result = ResetPasswordSchema.safeParse({
      token: "abc123token",
      password: "NewPass123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty token", () => {
    const result = ResetPasswordSchema.safeParse({
      token: "",
      password: "NewPass123",
    });
    expect(result.success).toBe(false);
  });
});
