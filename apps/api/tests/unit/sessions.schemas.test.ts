import { describe, it, expect } from "vitest";
import {
  SessionCreateSchema,
  SessionUpdateSchema,
  SessionListSchema,
  SessionAnswerSchema,
  SESSION_STATUSES,
} from "@interview/shared";

describe("SESSION_STATUSES", () => {
  it("includes expected statuses", () => {
    expect(SESSION_STATUSES).toContain("SCHEDULED");
    expect(SESSION_STATUSES).toContain("IN_PROGRESS");
    expect(SESSION_STATUSES).toContain("COMPLETED");
    expect(SESSION_STATUSES).toContain("CANCELLED");
  });
});

describe("SessionCreateSchema", () => {
  const valid = {
    title: "Frontend Engineer — Round 2",
    candidateId: "cand123",
    interviewerId: "user456",
    questionIds: ["q1", "q2", "q3"],
  };

  it("accepts minimal valid session", () => {
    expect(SessionCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts with scheduledAt ISO datetime", () => {
    const r = SessionCreateSchema.safeParse({
      ...valid,
      scheduledAt: "2026-07-01T14:00:00+00:00",
    });
    expect(r.success).toBe(true);
  });

  it("accepts with timeLimits map", () => {
    const r = SessionCreateSchema.safeParse({
      ...valid,
      timeLimits: { q1: 300, q2: 600 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects title shorter than 3 chars", () => {
    expect(SessionCreateSchema.safeParse({ ...valid, title: "AB" }).success).toBe(false);
  });

  it("rejects empty questionIds", () => {
    expect(SessionCreateSchema.safeParse({ ...valid, questionIds: [] }).success).toBe(false);
  });

  it("rejects more than 30 questions", () => {
    const r = SessionCreateSchema.safeParse({
      ...valid,
      questionIds: Array.from({ length: 31 }, (_, i) => `q${i}`),
    });
    expect(r.success).toBe(false);
  });

  it("rejects missing candidateId", () => {
    const { candidateId: _, ...rest } = valid;
    expect(SessionCreateSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid scheduledAt", () => {
    expect(SessionCreateSchema.safeParse({ ...valid, scheduledAt: "not-a-date" }).success).toBe(false);
  });
});

describe("SessionUpdateSchema", () => {
  it("accepts empty object", () => {
    expect(SessionUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update with title only", () => {
    const r = SessionUpdateSchema.safeParse({ title: "Updated title" });
    expect(r.success).toBe(true);
    expect(r.data?.title).toBe("Updated title");
  });

  it("accepts null scheduledAt to clear it", () => {
    const r = SessionUpdateSchema.safeParse({ scheduledAt: null });
    expect(r.success).toBe(true);
    expect(r.data?.scheduledAt).toBeNull();
  });

  it("rejects title shorter than 3 chars", () => {
    expect(SessionUpdateSchema.safeParse({ title: "AB" }).success).toBe(false);
  });
});

describe("SessionListSchema", () => {
  it("applies defaults", () => {
    const r = SessionListSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.sortBy).toBe("createdAt");
    expect(r.sortOrder).toBe("desc");
  });

  it("accepts status filter", () => {
    expect(SessionListSchema.parse({ status: "IN_PROGRESS" }).status).toBe("IN_PROGRESS");
  });

  it("rejects invalid status", () => {
    expect(SessionListSchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
  });

  it("accepts candidateId filter", () => {
    const r = SessionListSchema.parse({ candidateId: "cand123" });
    expect(r.candidateId).toBe("cand123");
  });

  it("coerces page and limit", () => {
    const r = SessionListSchema.parse({ page: "2", limit: "10" });
    expect(r.page).toBe(2);
    expect(r.limit).toBe(10);
  });
});

describe("SessionAnswerSchema", () => {
  it("accepts valid answer", () => {
    const r = SessionAnswerSchema.safeParse({ content: "The answer is..." });
    expect(r.success).toBe(true);
    expect(r.data?.flagged).toBe(false);
  });

  it("accepts flagged answer", () => {
    const r = SessionAnswerSchema.safeParse({ content: "Suspicious response", flagged: true });
    expect(r.success).toBe(true);
    expect(r.data?.flagged).toBe(true);
  });

  it("rejects empty content", () => {
    expect(SessionAnswerSchema.safeParse({ content: "" }).success).toBe(false);
  });

  it("rejects content over 10000 chars", () => {
    expect(SessionAnswerSchema.safeParse({ content: "x".repeat(10001) }).success).toBe(false);
  });
});
