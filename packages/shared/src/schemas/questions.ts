import { z } from "zod";
import { SearchSchema } from "./common";

// Kept as autocomplete suggestions only — no longer used as enum validation
export const QUESTION_CATEGORIES = [
  "Algorithms & Data Structures",
  "System Design",
  "Behavioral",
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Python",
  "Java",
  "Database",
  "DevOps",
  "Security",
  "Testing",
  "Leadership",
  "Problem Solving",
  "Other",
] as const;

export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const QUESTION_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const QuestionCreateSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  body: z.string().min(10, "Question body must be at least 10 characters").max(5000),
  category: z.string().min(1, "Category is required").max(100),
  subCategory: z.string().max(100).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default("MEDIUM"),
  tags: z.array(z.string().max(30)).max(10).default([]),
  isGlobal: z.boolean().default(false),
  expectedAnswer: z.string().max(5000).optional(),
});

export const QuestionUpdateSchema = QuestionCreateSchema.partial();

export const QuestionListSchema = SearchSchema.extend({
  category: z.string().optional(),
  subCategory: z.string().optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).optional(),
  isGlobal: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  tags: z.string().optional(), // comma-separated
});

export const AIGenerateSchema = z.object({
  topic: z.string().max(200).optional().or(z.literal("")),
  category: z.string().min(1, "Category is required").max(100),
  subCategory: z.string().max(100).optional(),
  difficulty: z.enum(QUESTION_DIFFICULTIES).default("MEDIUM"),
  count: z.coerce.number().int().min(1).max(10).default(5),
  context: z.string().max(500).optional(),
});

export type QuestionCreateInput = z.infer<typeof QuestionCreateSchema>;
export type QuestionUpdateInput = z.infer<typeof QuestionUpdateSchema>;
export type QuestionListInput = z.infer<typeof QuestionListSchema>;
export type AIGenerateInput = z.infer<typeof AIGenerateSchema>;
