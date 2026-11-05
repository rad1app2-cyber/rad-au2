import { describe, expect, it } from "vitest";
import { parseBudget, withinBudget } from "./supabase-source.server";

describe("customer budget ±25%", () => {
  it("reads 140 ألف as 140000", () => expect(parseBudget("بدي شقة ب 140 ألف دولار")).toBe(140000));
  it("reads millions", () => expect(parseBudget("ميزانيتي 1.2 مليون")).toBe(1200000));
  it("accepts 105k and 175k for 140k", () => {
    expect(withinBudget(105000, 140000)).toBe(true);
    expect(withinBudget(175000, 140000)).toBe(true);
  });
  it("rejects 550k for 140k", () => expect(withinBudget(550000, 140000)).toBe(false));
  it("rejects 100k for 140k", () => expect(withinBudget(100000, 140000)).toBe(false));
});
