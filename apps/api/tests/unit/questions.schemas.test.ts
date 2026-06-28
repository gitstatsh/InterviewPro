import { describe, it, expect } from "vitest";
import {
  QuestionCreateSchema,
  QuestionUpdateSchema,
  QuestionListSchema,
  AIGenerateSchema,
  QUESTION_CATEGORIES,
  QUESTION_DIFFICULTIES,
} from "@interview/shared";

describe("QUESTION_CATEGORIES", () => {
  it("includes expected categories", () => {
    expect(QUESTION_CATEGORIES).toContain("System Design");
    expect(QUESTION_CATEGORIES).toContain("Behavioral");
    expect(QUESTION_CATEGORIES).toContain("Algorithms & Data Structures");
  });
});

describe("QuestionCreateSchema", () => {
  const valid = {
    title: "Explain the difference between REST and GraphQL",
    body: "Compare and contrast REST and GraphQL APIs. When would you choose one over the other?",
    category: "System Design",
    difficulty: "MEDIUM",
    tags: ["api", "rest", "graphql"],
  };

  it("accepts valid question", () => {
    expect(QuestionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults difficulty to MEDIUM and isGlobal to false", () => {
    const result = QuestionCreateSchema.parse({ ...valid, difficulty: undefined });
    expect(result.difficulty).toBe("MEDIUM");
    expect(result.isGlobal).toBe(false);
  });

  it("defaults tags to empty array", () => {
    const result = QuestionCreateSchema.parse({ ...valid, tags: undefined });
    expect(result.tags).toEqual([]);
  });

  it("rejects title shorter than 5 chars", () => {
    const r = QuestionCreateSchema.safeParse({ ...valid, title: "Hi" });
    expect(r.success).toBe(false);
  });

  it("rejects body shorter than 10 chars", () => {
    const r = QuestionCreateSchema.safeParse({ ...valid, body: "Short" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid category", () => {
    const r = QuestionCreateSchema.safeParse({ ...valid, category: "Fishing" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid difficulty", () => {
    const r = QuestionCreateSchema.safeParse({ ...valid, difficulty: "EXTREME" });
    expect(r.success).toBe(false);
  });

  it("rejects more than 10 tags", () => {
    const r = QuestionCreateSchema.safeParse({
      ...valid,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional expectedAnswer", () => {
    const r = QuestionCreateSchema.safeParse({
      ...valid,
      expectedAnswer: "Look for understanding of tradeoffs...",
    });
    expect(r.success).toBe(true);
    expect(r.data?.expectedAnswer).toBeTruthy();
  });
});

describe("QuestionUpdateSchema", () => {
  it("accepts empty object", () => {
    expect(QuestionUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update", () => {
    const r = QuestionUpdateSchema.safeParse({ difficulty: "HARD" });
    expect(r.success).toBe(true);
    expect(r.data?.difficulty).toBe("HARD");
  });
});

describe("QuestionListSchema", () => {
  it("defaults to page 1, limit 20, desc", () => {
    const r = QuestionListSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.sortOrder).toBe("desc");
  });

  it("accepts category and difficulty filters", () => {
    const r = QuestionListSchema.parse({ category: "React", difficulty: "EASY" });
    expect(r.category).toBe("React");
    expect(r.difficulty).toBe("EASY");
  });

  it("transforms isGlobal from string", () => {
    expect(QuestionListSchema.parse({ isGlobal: "true" }).isGlobal).toBe(true);
    expect(QuestionListSchema.parse({ isGlobal: "false" }).isGlobal).toBe(false);
  });

  it("accepts tags as comma-separated string", () => {
    const r = QuestionListSchema.parse({ tags: "react,hooks" });
    expect(r.tags).toBe("react,hooks");
  });
});

describe("AIGenerateSchema", () => {
  it("accepts valid generation request", () => {
    const r = AIGenerateSchema.safeParse({
      topic: "React hooks and state management",
      category: "React",
      difficulty: "MEDIUM",
      count: 5,
    });
    expect(r.success).toBe(true);
  });

  it("defaults count to 5 and difficulty to MEDIUM", () => {
    const r = AIGenerateSchema.parse({
      topic: "System design",
      category: "System Design",
    });
    expect(r.count).toBe(5);
    expect(r.difficulty).toBe("MEDIUM");
  });

  it("rejects count > 10", () => {
    const r = AIGenerateSchema.safeParse({
      topic: "React",
      category: "React",
      count: 15,
    });
    expect(r.success).toBe(false);
  });

  it("rejects short topic", () => {
    const r = AIGenerateSchema.safeParse({
      topic: "ab",
      category: "React",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional context", () => {
    const r = AIGenerateSchema.safeParse({
      topic: "React performance",
      category: "React",
      context: "Focus on React 18 concurrent features",
    });
    expect(r.success).toBe(true);
    expect(r.data?.context).toBeTruthy();
  });
});
