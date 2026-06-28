import { z } from "zod";

export const QuestionBankCreateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().max(1000).optional(),
  isShared: z.boolean().default(false),
});

export const QuestionBankUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  isShared: z.boolean().optional(),
});

export const QuestionBankListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  includeShared: z.coerce.boolean().default(true),
});

export const AddQuestionsToBankSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1).max(100),
});

export const GenerateFromJDSchema = z.object({
  jobDescription: z.string().min(50, "Job description must be at least 50 characters").max(10000),
  count: z.coerce.number().int().min(1).max(20).default(10),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
});

export type QuestionBankCreateInput = z.infer<typeof QuestionBankCreateSchema>;
export type QuestionBankUpdateInput = z.infer<typeof QuestionBankUpdateSchema>;
export type QuestionBankListInput = z.infer<typeof QuestionBankListSchema>;
export type AddQuestionsToBankInput = z.infer<typeof AddQuestionsToBankSchema>;
export type GenerateFromJDInput = z.infer<typeof GenerateFromJDSchema>;
