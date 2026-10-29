import { describe, expect, it } from "vitest";

import {
  generationOutputSchema,
  handleSchema,
  pastedSamplesSchema,
} from "./domain";

describe("shared domain contracts", () => {
  it("normalizes an X handle", () => {
    expect(handleSchema.parse(" @okara_ai ")).toBe("okara_ai");
  });

  it("requires at least three pasted samples", () => {
    expect(() => pastedSamplesSchema.parse(["one sample", "two sample"])).toThrow();
  });

  it("requires exactly five generated drafts", () => {
    expect(() => generationOutputSchema.parse({ drafts: [] })).toThrow();
  });
});
