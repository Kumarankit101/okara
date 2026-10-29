import { describe, expect, it, vi } from "vitest";

import { checkGenerationQuota } from "./generation-quota";

describe("checkGenerationQuota", () => {
  const now = new Date("2026-10-29T08:00:00.000Z");

  it("allows usage below both limits", async () => {
    const countSince = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(20);

    await expect(checkGenerationQuota({ countSince, now })).resolves.toEqual({
      allowed: true,
    });
    expect(countSince).toHaveBeenNthCalledWith(1, "2026-10-29T07:59:00.000Z");
    expect(countSince).toHaveBeenNthCalledWith(2, "2026-10-28T08:00:00.000Z");
  });

  it("blocks bursts at the minute limit", async () => {
    const countSince = vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(20);

    await expect(checkGenerationQuota({ countSince, now })).resolves.toEqual({
      allowed: false,
      window: "minute",
      retryAfterSeconds: 60,
      limit: 5,
    });
  });

  it("blocks daily usage at the daily limit", async () => {
    const countSince = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(100);

    await expect(checkGenerationQuota({ countSince, now })).resolves.toEqual({
      allowed: false,
      window: "day",
      retryAfterSeconds: 86_400,
      limit: 100,
    });
  });

  it("propagates database failures instead of failing open", async () => {
    const countSince = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(checkGenerationQuota({ countSince, now })).rejects.toThrow(
      "database unavailable",
    );
  });
});
