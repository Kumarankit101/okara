import { describe, expect, it, vi } from "vitest";

import { fetchVoiceSource } from "./client";
import { XProviderError } from "./errors";

const fixedNow = new Date("2026-10-29T06:30:00.000Z");

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const userPayload = {
  data: {
    id: "123",
    name: "Example Writer",
    username: "ExampleWriter",
    description: "Writes useful things.",
    profile_image_url: "https://images.example/avatar.png",
    verified: true,
  },
};

const timelinePayload = {
  data: [
    {
      id: "p1",
      text: "A useful original thought, written with intent. https://example.com",
      created_at: "2026-10-28T00:00:00.000Z",
      lang: "en",
      conversation_id: "p1",
    },
    {
      id: "p2",
      text: "Another useful observation that sounds distinctly human.",
      created_at: "2026-10-27T00:00:00.000Z",
      lang: "en",
      conversation_id: "p2",
    },
  ],
  meta: { result_count: 2 },
};

describe("fetchVoiceSource", () => {
  it("looks up the user and requests recent original posts with safe parameters", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(userPayload))
      .mockResolvedValueOnce(jsonResponse(timelinePayload));

    const result = await fetchVoiceSource(" @ExampleWriter ", {
      bearerToken: "top-secret-token",
      fetchImpl,
      now: () => fixedNow,
    });

    expect(result.user).toEqual({
      id: "123",
      username: "ExampleWriter",
      name: "Example Writer",
      description: "Writes useful things.",
      profileImageUrl: "https://images.example/avatar.png",
      verified: true,
    });
    expect(result.posts).toHaveLength(2);
    expect(result.posts[0]?.text).toContain("[link]");
    expect(result.fetchedAt).toBe(fixedNow.toISOString());
    expect(result.expiresAt).toBe("2026-10-30T05:30:00.000Z");

    const [userUrl, userInit] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(userUrl.pathname).toBe("/2/users/by/username/ExampleWriter");
    expect(userUrl.searchParams.get("user.fields")).toContain("description");
    expect(userInit.headers).toMatchObject({
      Authorization: "Bearer top-secret-token",
    });

    const [timelineUrl] = fetchImpl.mock.calls[1] as [URL, RequestInit];
    expect(timelineUrl.pathname).toBe("/2/users/123/tweets");
    expect(timelineUrl.searchParams.get("max_results")).toBe("30");
    expect(timelineUrl.searchParams.get("exclude")).toBe("retweets,replies");
    expect(timelineUrl.searchParams.get("tweet.fields")).toContain(
      "created_at",
    );
  });

  it("rejects invalid handles before making a provider call", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchVoiceSource("not a handle!", {
        bearerToken: "secret",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_HANDLE", status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("provides an actionable pasted-sample fallback when credentials are missing", async () => {
    await expect(fetchVoiceSource("valid_handle")).rejects.toMatchObject({
      code: "MISSING_CREDENTIAL",
      message:
        "X profile import is not configured. Use pasted writing samples instead.",
    });
  });

  it.each([
    [401, "AUTHENTICATION_FAILED"],
    [403, "ACCESS_DENIED"],
    [404, "USER_NOT_FOUND"],
  ])("maps HTTP %i to %s without leaking credentials", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { detail: "provider body should not be exposed" },
        { status },
      ),
    );

    let received: unknown;
    try {
      await fetchVoiceSource("valid_handle", {
        bearerToken: "never-print-this-token",
        fetchImpl,
        maxAttempts: 1,
      });
    } catch (error) {
      received = error;
    }

    expect(received).toBeInstanceOf(XProviderError);
    expect(received).toMatchObject({ code });
    expect(String(received)).not.toContain("never-print-this-token");
    expect(String(received)).not.toContain("provider body");
  });

  it("rejects a structurally invalid successful response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: {} }));

    await expect(
      fetchVoiceSource("valid_handle", {
        bearerToken: "secret",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("retries a 429 using the provider delay before succeeding", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(jsonResponse(userPayload))
      .mockResolvedValueOnce(jsonResponse(timelinePayload));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await fetchVoiceSource("valid_handle", {
      bearerToken: "secret",
      fetchImpl,
      sleep,
      maxRetryDelayMs: 750,
    });

    expect(result.user.id).toBe("123");
    expect(sleep).toHaveBeenCalledWith(750);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries server failures only up to the configured bound", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchVoiceSource("valid_handle", {
        bearerToken: "secret",
        fetchImpl,
        sleep,
        maxAttempts: 2,
      }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("maps an aborted request to a timeout", async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    );

    await expect(
      fetchVoiceSource("valid_handle", {
        bearerToken: "secret",
        fetchImpl: fetchImpl as typeof fetch,
        timeoutMs: 1,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
  });

  it("maps transport failures to a retryable network error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchVoiceSource("valid_handle", {
        bearerToken: "secret",
        fetchImpl,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR", retryable: true });
  });

  it("follows one pagination token when the first page is too small", async () => {
    const firstPage = {
      data: timelinePayload.data.slice(0, 1),
      meta: { result_count: 1, next_token: "next-page" },
    };
    const secondPage = {
      data: [
        {
          id: "p3",
          text: "A third original observation from the next page.",
          created_at: "2026-10-26T00:00:00.000Z",
          lang: "en",
        },
      ],
      meta: { result_count: 1 },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(userPayload))
      .mockResolvedValueOnce(jsonResponse(firstPage))
      .mockResolvedValueOnce(jsonResponse(secondPage));

    const result = await fetchVoiceSource("valid_handle", {
      bearerToken: "secret",
      fetchImpl,
      maxPages: 2,
    });

    expect(result.posts).toHaveLength(2);
    const [secondPageUrl] = fetchImpl.mock.calls[2] as [URL, RequestInit];
    expect(secondPageUrl.searchParams.get("pagination_token")).toBe(
      "next-page",
    );
  });
});

