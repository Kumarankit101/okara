import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { GET } from "./route";

describe("expired source cleanup route", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    rpc.mockReset();
  });

  it("rejects requests when the cron secret is not configured", async () => {
    const response = await GET(new Request("http://localhost/api/cron/cleanup-sources"));

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    process.env.CRON_SECRET = "a-secure-test-secret";

    const response = await GET(
      new Request("http://localhost/api/cron/cleanup-sources", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes expired rows through the service-role RPC", async () => {
    process.env.CRON_SECRET = "a-secure-test-secret";
    rpc.mockResolvedValue({ data: 7, error: null });

    const response = await GET(
      new Request("http://localhost/api/cron/cleanup-sources", {
        headers: { authorization: "Bearer a-secure-test-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 7 });
    expect(rpc).toHaveBeenCalledWith("delete_expired_source_posts");
  });

  it("does not report success when the cleanup RPC fails", async () => {
    process.env.CRON_SECRET = "a-secure-test-secret";
    rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });

    const response = await GET(
      new Request("http://localhost/api/cron/cleanup-sources", {
        headers: { authorization: "Bearer a-secure-test-secret" },
      }),
    );

    expect(response.status).toBe(500);
  });
});
