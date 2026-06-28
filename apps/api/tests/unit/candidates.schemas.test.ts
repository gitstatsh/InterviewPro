import { describe, it, expect } from "vitest";
import {
  CandidateCreateSchema,
  CandidateUpdateSchema,
  CandidateListSchema,
  CandidateCSVRowSchema,
} from "@interview/shared";

describe("CandidateCreateSchema", () => {
  const valid = {
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
  };

  it("accepts minimal valid candidate", () => {
    expect(CandidateCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts full candidate with all optional fields", () => {
    const r = CandidateCreateSchema.safeParse({
      ...valid,
      phone: "+1-555-0100",
      resumeUrl: "https://example.com/resume.pdf",
      linkedinUrl: "https://linkedin.com/in/janesmith",
      notes: "Strong background in distributed systems",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty firstName", () => {
    expect(CandidateCreateSchema.safeParse({ ...valid, firstName: "" }).success).toBe(false);
  });

  it("rejects empty lastName", () => {
    expect(CandidateCreateSchema.safeParse({ ...valid, lastName: "" }).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(CandidateCreateSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects invalid resumeUrl", () => {
    expect(CandidateCreateSchema.safeParse({ ...valid, resumeUrl: "not-a-url" }).success).toBe(false);
  });

  it("accepts empty string for optional URL fields", () => {
    const r = CandidateCreateSchema.safeParse({ ...valid, resumeUrl: "", linkedinUrl: "" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid linkedinUrl", () => {
    expect(CandidateCreateSchema.safeParse({ ...valid, linkedinUrl: "not-a-url" }).success).toBe(false);
  });
});

describe("CandidateUpdateSchema", () => {
  it("accepts empty object", () => {
    expect(CandidateUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial update", () => {
    const r = CandidateUpdateSchema.safeParse({ notes: "Updated notes" });
    expect(r.success).toBe(true);
    expect(r.data?.notes).toBe("Updated notes");
  });

  it("validates email when provided", () => {
    expect(CandidateUpdateSchema.safeParse({ email: "bad-email" }).success).toBe(false);
    expect(CandidateUpdateSchema.safeParse({ email: "good@email.com" }).success).toBe(true);
  });
});

describe("CandidateListSchema", () => {
  it("applies defaults", () => {
    const r = CandidateListSchema.parse({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.sortBy).toBe("createdAt");
    expect(r.sortOrder).toBe("desc");
  });

  it("coerces string numbers", () => {
    const r = CandidateListSchema.parse({ page: "3", limit: "50" });
    expect(r.page).toBe(3);
    expect(r.limit).toBe(50);
  });

  it("rejects invalid sortBy", () => {
    expect(CandidateListSchema.safeParse({ sortBy: "unknown" }).success).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(CandidateListSchema.safeParse({ limit: 200 }).success).toBe(false);
  });

  it("accepts search string", () => {
    const r = CandidateListSchema.parse({ search: "john" });
    expect(r.search).toBe("john");
  });
});

describe("CandidateCSVRowSchema", () => {
  const valid = {
    firstName: "Alice",
    lastName: "Chen",
    email: "alice@example.com",
  };

  it("accepts minimal CSV row", () => {
    expect(CandidateCSVRowSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts optional fields", () => {
    const r = CandidateCSVRowSchema.safeParse({
      ...valid,
      phone: "+1-555-9999",
      linkedinUrl: "https://linkedin.com/in/alice",
      notes: "Referred by team",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing email", () => {
    const { email: _, ...noEmail } = valid;
    expect(CandidateCSVRowSchema.safeParse(noEmail).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(CandidateCSVRowSchema.safeParse({ ...valid, email: "bad" }).success).toBe(false);
  });
});
