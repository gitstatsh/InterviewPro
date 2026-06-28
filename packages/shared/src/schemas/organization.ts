import { z } from "zod";
import { SearchSchema } from "./common";

export const OrganizationCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug may only contain lowercase letters, numbers, and hyphens")
    .optional(),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  description: z.string().max(500).optional(),
  logo: z.string().optional().nullable(),
});

export const OrganizationUpdateSchema = OrganizationCreateSchema.partial().omit(
  { slug: true }
).extend({
  logo: z.string().optional().nullable(),
});

export const InviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["ORG_HR", "ORG_MEMBER"]).default("ORG_MEMBER"),
});

export const MemberListSchema = SearchSchema.extend({
  role: z.enum(["OWNER", "ORG_HR", "ORG_MEMBER"]).optional(),
});

export type OrganizationCreateInput = z.infer<typeof OrganizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof OrganizationUpdateSchema>;
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
export type MemberListInput = z.infer<typeof MemberListSchema>;
