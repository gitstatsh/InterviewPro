import { describe, it, expect } from "vitest";
import {
  AssessmentUpsertSchema,
  BulkAssessmentSchema,
  SCORE_LABELS,
} from "@interview/shared";

describe("SCORE_LABELS", () => {
  it("has labels for scores 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(SCORE_LABELS[i]).toBeTruthy();
    }
  });

  it("maps 1 to Poor and 5 to Outstanding", () => {
    expect(SCORE_LABELS[1]).toBe("Poor");
    expect(SCORE_LABELS[5]).toBe("Outstanding");
  });
});

describe("AssessmentUpsertSchema", () => {
  it("accepts valid score with notes", () => {
    const r = AssessmentUpsertSchema.safeParse({ score: 4, notes: "Strong answer" });
    expect(r.success).toBe(true);
  });

  it("accepts score without notes", () => {
    expect(AssessmentUpsertSchema.safeParse({ score: 3 }).success).toBe(true);
  });

  it("rejects score below 1", () => {
    expect(AssessmentUpsertSchema.safeParse({ score: 0 }).success).toBe(false);
  });

  it("rejects score above 5", () => {
    expect(AssessmentUpsertSchema.safeParse({ score: 6 }).success).toBe(false);
  });

  it("rejects non-integer score", () => {
    expect(AssessmentUpsertSchema.safeParse({ score: 3.5 }).success).toBe(false);
  });

  it("rejects notes over 2000 chars", () => {
    expect(AssessmentUpsertSchema.safeParse({ score: 3, notes: "x".repeat(2001) }).success).toBe(false);
  });

  it("accepts all valid scores 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(AssessmentUpsertSchema.safeParse({ score: i }).success).toBe(true);
    }
  });
});

describe("BulkAssessmentSchema", () => {
  const validItem = { answerId: "ans1", score: 4 };

  it("accepts single valid item", () => {
    expect(BulkAssessmentSchema.safeParse({ assessments: [validItem] }).success).toBe(true);
  });

  it("accepts multiple items with optional notes", () => {
    const r = BulkAssessmentSchema.safeParse({
      assessments: [
        { answerId: "ans1", score: 5, notes: "Excellent" },
        { answerId: "ans2", score: 2 },
        { answerId: "ans3", score: 3, notes: "Adequate" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty assessments array", () => {
    expect(BulkAssessmentSchema.safeParse({ assessments: [] }).success).toBe(false);
  });

  it("rejects more than 30 items", () => {
    const r = BulkAssessmentSchema.safeParse({
      assessments: Array.from({ length: 31 }, (_, i) => ({ answerId: `ans${i}`, score: 3 })),
    });
    expect(r.success).toBe(false);
  });

  it("rejects invalid score in any item", () => {
    const r = BulkAssessmentSchema.safeParse({
      assessments: [validItem, { answerId: "ans2", score: 10 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing answerId", () => {
    expect(BulkAssessmentSchema.safeParse({ assessments: [{ score: 3 }] }).success).toBe(false);
  });
});
