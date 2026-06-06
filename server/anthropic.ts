/**
 * Server-side Anthropic Messages call with automatic retry + backoff.
 *
 * Every AI feature — including the incident-investigation corrective-action
 * suggestion — reaches the provider through `anthropicFetch`. Provider rate
 * limits (HTTP 429), overload (529) and transient 5xx / network blips are
 * retried with exponential backoff and full jitter, honoring a `retry-after`
 * header when one is supplied. Once the (bounded) retries are exhausted the
 * caller's existing non-OK handling runs and the client falls back to its
 * offline rule-based draft — so the AI step degrades gracefully instead of
 * failing on the first rate-limit response.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export interface AnthropicRetryOptions {
  /** Number of retries after the first attempt (default 3 => up to 4 tries). */
  maxRetries?: number;
  /** Base backoff in ms for the exponential schedule (default 500). */
  baseMs?: number;
  /** Upper bound on any single backoff in ms (default 4000) — keeps the request responsive. */
  capMs?: number;
  /** Jitter source returning 0..1 (default Math.random); injectable for tests. */
  jitter?: () => number;
  /** fetch implementation; injectable for tests. */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
  /** sleep implementation; injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** 429 (rate limited), 529 (overloaded) and any 5xx are worth retrying. */
export function isRetryableAnthropicStatus(status: number): boolean {
  return status === 429 || status === 529 || (status >= 500 && status <= 599);
}

/** Parse a `retry-after` header (RFC 9110 delay-seconds or HTTP-date) into ms; null if absent/invalid. */
export function parseRetryAfterMs(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dateMs = Date.parse(trimmed);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - now);
}

/**
 * Delay before retry `attempt` (1-based). An explicit server hint wins (capped);
 * otherwise exponential backoff (base·2^(n-1)) with full jitter, capped.
 */
export function anthropicBackoffMs(
  attempt: number,
  opts: { retryAfterMs?: number | null; baseMs?: number; capMs?: number; jitter?: number } = {},
): number {
  const base = opts.baseMs ?? 500;
  const cap = opts.capMs ?? 4000;
  if (opts.retryAfterMs != null && opts.retryAfterMs >= 0) return Math.min(opts.retryAfterMs, cap);
  const n = Math.max(1, attempt);
  const exp = base * 2 ** (n - 1);
  const jitter = (opts.jitter ?? Math.random()) * base;
  return Math.min(Math.round(exp + jitter), cap);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST to the Anthropic Messages API with retry/backoff. `init` is the usual
 * fetch init (method/headers/body); the URL is fixed. Returns the final
 * Response, which may still be non-OK after retries — the caller handles that.
 */
export async function anthropicFetch(init: RequestInit, options: AnthropicRetryOptions = {}): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await doFetch(ANTHROPIC_URL, init);
      if (res.ok || !isRetryableAnthropicStatus(res.status) || attempt > maxRetries) return res;
      await sleep(
        anthropicBackoffMs(attempt, {
          retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
          baseMs: options.baseMs,
          capMs: options.capMs,
          jitter: options.jitter?.(),
        }),
      );
    } catch (err) {
      lastError = err;
      if (attempt > maxRetries) throw err;
      await sleep(anthropicBackoffMs(attempt, { baseMs: options.baseMs, capMs: options.capMs, jitter: options.jitter?.() }));
    }
  }
  // The loop always returns or throws within maxRetries+1 iterations; this only satisfies the type checker.
  throw lastError ?? new Error('anthropicFetch: exhausted retries');
}
