import { describe, it, expect } from "vitest";
import {
  OrganizationCreateSchema,
  OrganizationUpdateSchema,
  InviteMemberSchema,
  MemberListSchema,
} from "@interview/shared";

describe("OrganizationCreateSchema", () => {
  it("accepts valid org data", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "acme-corp",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional website and description", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "acme-corp",
      website: "https://acme.com",
      description: "We make everything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short name", () => {
    const result = OrganizationCreateSchema.safeParse({ name: "A", slug: "a" });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.name).toBeDefined();
  });

  it("rejects slug with uppercase", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "AcmeCorp",
    });
    expect(result.success).toBe(false);
    expect(result.error?.flatten().fieldErrors.slug).toBeDefined();
  });

  it("rejects slug with spaces", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "acme corp",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid website URL", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "acme",
      website: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("allows empty string website (treated as unset)", () => {
    const result = OrganizationCreateSchema.safeParse({
      name: "Acme Corp",
      slug: "acme",
      website: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("OrganizationUpdateSchema", () => {
  it("accepts partial update", () => {
    expect(
      OrganizationUpdateSchema.safeParse({ name: "New Name" }).success
    ).toBe(true);
  });

  it("accepts empty object", () => {
    expect(OrganizationUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe("InviteMemberSchema", () => {
  it("accepts valid invite", () => {
    const result = InviteMemberSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("MEMBER");
  });

  it("accepts admin role", () => {
    const result = InviteMemberSchema.safeParse({
      email: "admin@example.com",
      role: "ADMIN",
    });
    expect(result.success).toBe(true);
    expect(result.data?.role).toBe("ADMIN");
  });

  it("rejects OWNER role (cannot invite as owner)", () => {
    const result = InviteMemberSchema.safeParse({
      email: "owner@example.com",
      role: "OWNER",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(InviteMemberSchema.safeParse({ email: "bad" }).success).toBe(false);
  });
});

describe("MemberListSchema", () => {
  it("defaults to page 1, limit 20, sortOrder desc", () => {
    const result = MemberListSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sortOrder).toBe("desc");
  });

  it("accepts role filter", () => {
    const result = MemberListSchema.parse({ role: "ADMIN" });
    expect(result.role).toBe("ADMIN");
  });

  it("rejects invalid role filter", () => {
    expect(MemberListSchema.safeParse({ role: "SUPERUSER" }).success).toBe(false);
  });
});
