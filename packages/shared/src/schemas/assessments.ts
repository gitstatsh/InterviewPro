import { z } from "zod";

export const SCORE_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

export const AssessmentUpsertSchema = z.object({
  score: z.number().int().min(1).max(5, "Score must be between 1 and 5"),
  notes: z.string().max(2000).optional(),
});

export const BulkAssessmentSchema = z.object({
  assessments: z.array(
    z.object({
      answerId: z.string().min(1),
      score: z.number().int().min(1).max(5),
      notes: z.string().max(2000).optional(),
    })
  ).min(1).max(30),
});

export type AssessmentUpsertInput = z.infer<typeof AssessmentUpsertSchema>;
export type BulkAssessmentInput = z.infer<typeof BulkAssessmentSchema>;
