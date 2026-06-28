import { z } from "zod";

export const SESSION_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionCreateSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  candidateId: z.string().min(1, "Candidate required"),
  interviewerId: z.string().min(1, "Interviewer required"),
  scheduledAt: z.string().optional(),
  questionIds: z
    .array(z.string().min(1))
    .max(30, "Maximum 30 questions per session")
    .optional()
    .default([]),
  timeLimits: z.record(z.string(), z.number().int().min(30).max(3600)).optional(),
  notes: z.string().max(5000).optional(),
});

// Used by Org Member to attach a bank's questions to an existing session
export const AssignBankToSessionSchema = z.object({
  bankId: z.string().min(1, "Bank required"),
  replace: z.boolean().default(true), // replace existing questions or append
});

export const SessionUpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(5000).optional(),
});

export const SessionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(SESSION_STATUSES).optional(),
  candidateId: z.string().optional(),
  sortBy: z.enum(["scheduledAt", "createdAt", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const SessionAnswerSchema = z.object({
  content: z.string().max(10000).default(""),
  notes: z.string().max(5000).optional(),
  flagged: z.boolean().default(false),
});

export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;
export type SessionUpdateInput = z.infer<typeof SessionUpdateSchema>;
export type SessionListInput = z.infer<typeof SessionListSchema>;
export type SessionAnswerInput = z.infer<typeof SessionAnswerSchema>;
export type AssignBankToSessionInput = z.infer<typeof AssignBankToSessionSchema>;
