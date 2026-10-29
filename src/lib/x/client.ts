import { ZodError } from "zod";

import { handleSchema } from "@/lib/contracts";

import { XProviderError } from "./errors";
import {
  normalizeXPosts,
  sourceExpiresAt,
  type NormalizedSourcePost,
} from "./normalization";
import {
  xTimelineResponseSchema,
  xUserLookupResponseSchema,
  type XPostPayload,
} from "./schemas";

const X_API_BASE_URL = "https://api.x.com/2";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_MAX_RETRY_DELAY_MS = 2_000;

export interface VoiceSourceUser {
  id: string;
  username: string;
  name: string;
  description: string;
  profileImageUrl: string | null;
  verified: boolean;
}

export interface VoiceSource {
  user: VoiceSourceUser;
  posts: NormalizedSourcePost[];
  fetchedAt: string;
  expiresAt: string;
}

export interface XClientOptions {
  bearerToken?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxPages?: number;
  maxRetryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

/** Fetches a public user's recent original posts through X API v2. */
export async function fetchVoiceSource(
  rawHandle: string,
  options: XClientOptions = {},
): Promise<VoiceSource> {
  const handle = parseHandle(rawHandle);
  const bearerToken = options.bearerToken?.trim();
  if (!bearerToken) throw new XProviderError("MISSING_CREDENTIAL");

  const configuration = resolveOptions(options, bearerToken);
  const userUrl = new URL(
    `${configuration.baseUrl}/users/by/username/${encodeURIComponent(handle)}`,
  );
  userUrl.searchParams.set(
    "user.fields",
    "id,name,username,description,profile_image_url,verified",
  );

  const userResponse = await requestJson(userUrl, configuration);
  const user = parseResponse(xUserLookupResponseSchema, userResponse).data;
  const posts = await fetchRecentPosts(user.id, configuration);
  const fetchedAtDate = configuration.now();

  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      description: user.description,
      profileImageUrl: user.profile_image_url ?? null,
      verified: user.verified ?? false,
    },
    posts: normalizeXPosts(posts, 30),
    fetchedAt: fetchedAtDate.toISOString(),
    expiresAt: sourceExpiresAt(fetchedAtDate),
  };
}

interface ResolvedOptions {
  bearerToken: string;
  fetchImpl: typeof fetch;
  baseUrl: string;
  timeoutMs: number;
  maxAttempts: number;
  maxPages: number;
  maxRetryDelayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
  now: () => Date;
}

function resolveOptions(
  options: XClientOptions,
  bearerToken: string,
): ResolvedOptions {
  return {
    bearerToken,
    fetchImpl: options.fetchImpl ?? fetch,
    baseUrl: (options.baseUrl ?? X_API_BASE_URL).replace(/\/$/u, ""),
    timeoutMs: positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    maxAttempts: Math.min(
      5,
      positiveInteger(options.maxAttempts, DEFAULT_ATTEMPTS),
    ),
    maxPages: Math.min(3, positiveInteger(options.maxPages, 2)),
    maxRetryDelayMs: positiveInteger(
      options.maxRetryDelayMs,
      DEFAULT_MAX_RETRY_DELAY_MS,
    ),
    sleep:
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
    now: options.now ?? (() => new Date()),
  };
}

async function fetchRecentPosts(
  userId: string,
  configuration: ResolvedOptions,
): Promise<XPostPayload[]> {
  const collected: XPostPayload[] = [];
  let paginationToken: string | undefined;

  for (let page = 0; page < configuration.maxPages; page += 1) {
    const timelineUrl = new URL(
      `${configuration.baseUrl}/users/${encodeURIComponent(userId)}/tweets`,
    );
    timelineUrl.searchParams.set("max_results", "30");
    timelineUrl.searchParams.set("exclude", "retweets,replies");
    timelineUrl.searchParams.set(
      "tweet.fields",
      "id,text,created_at,lang,conversation_id,referenced_tweets",
    );
    if (paginationToken) {
      timelineUrl.searchParams.set("pagination_token", paginationToken);
    }

    const response = parseResponse(
      xTimelineResponseSchema,
      await requestJson(timelineUrl, configuration),
    );
    collected.push(...response.data);
    paginationToken = response.meta.next_token;

    if (!paginationToken || normalizeXPosts(collected, 30).length >= 30) break;
  }

  return collected;
}

async function requestJson(
  url: URL,
  configuration: ResolvedOptions,
): Promise<unknown> {
  let lastError: XProviderError | undefined;

  for (let attempt = 1; attempt <= configuration.maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);

    try {
      const response = await configuration.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${configuration.bearerToken}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const providerError = mapHttpError(response.status);
        if (providerError.retryable && attempt < configuration.maxAttempts) {
          await configuration.sleep(
            retryDelay(response, attempt, configuration),
          );
          lastError = providerError;
          continue;
        }
        throw providerError;
      }

      try {
        return await response.json();
      } catch (error) {
        throw new XProviderError("INVALID_RESPONSE", { cause: error });
      }
    } catch (error) {
      const providerError = normalizeRequestError(error);
      if (providerError.retryable && attempt < configuration.maxAttempts) {
        await configuration.sleep(
          Math.min(250 * 2 ** (attempt - 1), configuration.maxRetryDelayMs),
        );
        lastError = providerError;
        continue;
      }
      throw providerError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new XProviderError("UPSTREAM_UNAVAILABLE");
}

function retryDelay(
  response: Response,
  attempt: number,
  configuration: ResolvedOptions,
): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1_000, configuration.maxRetryDelayMs);
    }
    const dateDelay = Date.parse(retryAfter) - configuration.now().getTime();
    if (Number.isFinite(dateDelay) && dateDelay > 0) {
      return Math.min(dateDelay, configuration.maxRetryDelayMs);
    }
  }

  const rateLimitReset = Number(response.headers.get("x-rate-limit-reset"));
  if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) {
    const resetDelay = rateLimitReset * 1_000 - configuration.now().getTime();
    if (resetDelay > 0) {
      return Math.min(resetDelay, configuration.maxRetryDelayMs);
    }
  }

  return Math.min(250 * 2 ** (attempt - 1), configuration.maxRetryDelayMs);
}

function mapHttpError(status: number): XProviderError {
  if (status === 401) return new XProviderError("AUTHENTICATION_FAILED");
  if (status === 403) return new XProviderError("ACCESS_DENIED");
  if (status === 404) return new XProviderError("USER_NOT_FOUND");
  if (status === 429) return new XProviderError("RATE_LIMITED");
  if (status >= 500) return new XProviderError("UPSTREAM_UNAVAILABLE");
  return new XProviderError("INVALID_RESPONSE", { status: 502 });
}

function normalizeRequestError(error: unknown): XProviderError {
  if (error instanceof XProviderError) return error;
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new XProviderError("TIMEOUT", { cause: error });
  }
  return new XProviderError("NETWORK_ERROR", { cause: error });
}

function parseHandle(rawHandle: string): string {
  try {
    return handleSchema.parse(rawHandle);
  } catch (error) {
    throw new XProviderError("INVALID_HANDLE", { cause: error });
  }
}

function parseResponse<T>(
  schema: { parse(value: unknown): T },
  value: unknown,
): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new XProviderError("INVALID_RESPONSE", {
      cause: error instanceof ZodError ? error : undefined,
    });
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

