import { describe, it, expect } from "vitest";
import {
  RoleCreateSchema,
  RoleUpdateSchema,
  AssignRoleSchema,
  RoleListSchema,
  PERMISSIONS,
} from "@interview/shared";

describe("PERMISSIONS constant", () => {
  it("includes expected actions", () => {
    expect(PERMISSIONS).toContain("candidates:read");
    expect(PERMISSIONS).toContain("sessions:create");
    expect(PERMISSIONS).toContain("roles:manage");
  });

  it("all entries follow resource:action format", () => {
    for (const p of PERMISSIONS) {
      expect(p).toMatch(/^[a-z]+:[a-z]+$/);
    }
  });
});

describe("RoleCreateSchema", () => {
  it("accepts valid role with permissions", () => {
    const result = RoleCreateSchema.safeParse({
      name: "Senior Interviewer",
      permissions: ["candidates:read", "sessions:read"],
    });
    expect(result.success).toBe(true);
    expect(result.data?.isGlobal).toBe(false);
  });

  it("defaults to empty permissions and isGlobal: false", () => {
    const result = RoleCreateSchema.safeParse({ name: "Basic Role" });
    expect(result.success).toBe(true);
    expect(result.data?.permissions).toEqual([]);
    expect(result.data?.isGlobal).toBe(false);
  });

  it("rejects short name", () => {
    expect(RoleCreateSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("rejects unknown permission", () => {
    const result = RoleCreateSchema.safeParse({
      name: "Bad Role",
      permissions: ["unknown:action"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid permissions at once", () => {
    const result = RoleCreateSchema.safeParse({
      name: "Super Role",
      permissions: [...PERMISSIONS],
    });
    expect(result.success).toBe(true);
  });
});

describe("RoleUpdateSchema", () => {
  it("accepts empty object (no changes)", () => {
    expect(RoleUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with just permissions", () => {
    const result = RoleUpdateSchema.safeParse({
      permissions: ["reports:read"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid permission in update", () => {
    expect(
      RoleUpdateSchema.safeParse({ permissions: ["bad:perm"] }).success
    ).toBe(false);
  });
});

describe("AssignRoleSchema", () => {
  it("accepts a valid roleId", () => {
    expect(AssignRoleSchema.safeParse({ roleId: "abc123" }).success).toBe(true);
  });

  it("rejects empty roleId", () => {
    expect(AssignRoleSchema.safeParse({ roleId: "" }).success).toBe(false);
  });

  it("rejects missing roleId", () => {
    expect(AssignRoleSchema.safeParse({}).success).toBe(false);
  });
});

describe("RoleListSchema", () => {
  it("defaults to page 1 and desc sort", () => {
    const result = RoleListSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.sortOrder).toBe("desc");
  });

  it("transforms isGlobal string 'true' to boolean", () => {
    const result = RoleListSchema.parse({ isGlobal: "true" });
    expect(result.isGlobal).toBe(true);
  });

  it("transforms isGlobal string 'false' to boolean", () => {
    const result = RoleListSchema.parse({ isGlobal: "false" });
    expect(result.isGlobal).toBe(false);
  });

  it("leaves isGlobal undefined for unknown strings", () => {
    const result = RoleListSchema.parse({ isGlobal: "maybe" });
    expect(result.isGlobal).toBeUndefined();
  });
});
