import { z } from "zod";

export const CandidateCreateSchema = z.object({
  firstName: z.string().min(1, "First name required").max(100),
  lastName: z.string().min(1, "Last name required").max(100),
  email: z.string().email("Invalid email"),
  phone: z.string().max(30).optional(),
  resumeUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  linkedinUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
});

export const CandidateUpdateSchema = CandidateCreateSchema.partial();

export const CandidateListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(["firstName", "lastName", "email", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const CandidateCSVRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")).optional(),
  notes: z.string().optional(),
});

export type CandidateCreateInput = z.infer<typeof CandidateCreateSchema>;
export type CandidateUpdateInput = z.infer<typeof CandidateUpdateSchema>;
export type CandidateListInput = z.infer<typeof CandidateListSchema>;
export type CandidateCSVRow = z.infer<typeof CandidateCSVRowSchema>;
