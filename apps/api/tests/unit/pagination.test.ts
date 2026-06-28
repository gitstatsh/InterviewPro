import { describe, it, expect } from "vitest";
import { paginate, paginationMeta, PaginationSchema, SearchSchema } from "@interview/shared";

describe("paginate()", () => {
  it("calculates correct skip/take for page 1", () => {
    expect(paginate(1, 20)).toEqual({ skip: 0, take: 20 });
  });

  it("calculates correct skip/take for page 3", () => {
    expect(paginate(3, 10)).toEqual({ skip: 20, take: 10 });
  });
});

describe("paginationMeta()", () => {
  it("returns correct meta for 100 items, page 1, limit 20", () => {
    expect(paginationMeta(100, 1, 20)).toEqual({
      total: 100,
      page: 1,
      limit: 20,
      totalPages: 5,
    });
  });

  it("rounds up totalPages", () => {
    expect(paginationMeta(101, 1, 20).totalPages).toBe(6);
  });
});

describe("PaginationSchema", () => {
  it("defaults page=1, limit=20", () => {
    const result = PaginationSchema.parse({});
    expect(result).toEqual({ page: 1, limit: 20 });
  });

  it("coerces string page/limit to numbers", () => {
    const result = PaginationSchema.parse({ page: "2", limit: "50" });
    expect(result).toEqual({ page: 2, limit: 50 });
  });

  it("rejects limit > 100", () => {
    expect(PaginationSchema.safeParse({ limit: 200 }).success).toBe(false);
  });
});

describe("SearchSchema", () => {
  it("defaults sortOrder to desc", () => {
    const result = SearchSchema.parse({});
    expect(result.sortOrder).toBe("desc");
  });

  it("accepts asc sortOrder", () => {
    const result = SearchSchema.parse({ sortOrder: "asc" });
    expect(result.sortOrder).toBe("asc");
  });
});
