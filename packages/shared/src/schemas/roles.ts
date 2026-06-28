import { z } from "zod";
import { SearchSchema } from "./common";

export const PERMISSIONS = [
  // Candidates
  "candidates:read",
  "candidates:create",
  "candidates:update",
  "candidates:delete",
  // Questions
  "questions:read",
  "questions:create",
  "questions:update",
  "questions:delete",
  // Sessions
  "sessions:read",
  "sessions:create",
  "sessions:update",
  "sessions:delete",
  // Assessments
  "assessments:read",
  "assessments:create",
  "assessments:update",
  // Reports
  "reports:read",
  "reports:generate",
  // Members
  "members:read",
  "members:invite",
  "members:remove",
  // Roles
  "roles:read",
  "roles:manage",
] as const;

export type PermissionAction = (typeof PERMISSIONS)[number];

export const RoleCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  description: z.string().max(200).optional(),
  isGlobal: z.boolean().default(false),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
});

export const RoleUpdateSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).optional(),
});

export const AssignRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const RoleListSchema = SearchSchema.extend({
  isGlobal: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
});

export type RoleCreateInput = z.infer<typeof RoleCreateSchema>;
export type RoleUpdateInput = z.infer<typeof RoleUpdateSchema>;
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;
export type RoleListInput = z.infer<typeof RoleListSchema>;
