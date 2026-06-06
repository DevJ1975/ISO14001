import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anthropicBackoffMs, anthropicFetch, isRetryableAnthropicStatus, parseRetryAfterMs } from '../server/anthropic';

function res(status: number, headers: Record<string, string> = {}): Response {
  return new Response('{}', { status, headers });
}
const noSleep = async (): Promise<void> => {};

describe('isRetryableAnthropicStatus', () => {
  it('retries 429 / 529 / 5xx but not 2xx / 4xx', () => {
    for (const s of [429, 529, 500, 502, 503, 504]) assert.equal(isRetryableAnthropicStatus(s), true);
    for (const s of [200, 201, 400, 401, 404, 409]) assert.equal(isRetryableAnthropicStatus(s), false);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses delay-seconds', () => {
    assert.equal(parseRetryAfterMs('2'), 2000);
    assert.equal(parseRetryAfterMs('0'), 0);
  });
  it('parses an HTTP-date relative to now', () => {
    const now = 1_000_000; // whole second, so the date round-trips exactly
    assert.equal(parseRetryAfterMs(new Date(now + 5000).toUTCString(), now), 5000);
  });
  it('returns null for missing or unparseable values', () => {
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs(undefined), null);
    assert.equal(parseRetryAfterMs(''), null);
    assert.equal(parseRetryAfterMs('soon'), null);
  });
});

describe('anthropicBackoffMs', () => {
  it('honors an explicit retry-after hint, capped', () => {
    assert.equal(anthropicBackoffMs(1, { retryAfterMs: 2000 }), 2000);
    assert.equal(anthropicBackoffMs(1, { retryAfterMs: 99_999, capMs: 4000 }), 4000);
  });
  it('is exponential with jitter pinned to 0', () => {
    assert.equal(anthropicBackoffMs(1, { baseMs: 500, jitter: 0 }), 500);
    assert.equal(anthropicBackoffMs(2, { baseMs: 500, jitter: 0 }), 1000);
    assert.equal(anthropicBackoffMs(3, { baseMs: 500, jitter: 0 }), 2000);
  });
  it('caps the exponential schedule', () => {
    assert.equal(anthropicBackoffMs(10, { baseMs: 500, capMs: 4000, jitter: 0 }), 4000);
  });
  it('adds up to one base of jitter', () => {
    assert.equal(anthropicBackoffMs(1, { baseMs: 500, jitter: 1 }), 1000);
  });
});

describe('anthropicFetch', () => {
  it('returns immediately on success with no retry', async () => {
    let calls = 0;
    const r = await anthropicFetch({}, { fetchImpl: async () => ((calls += 1), res(200)), sleep: noSleep });
    assert.equal(r.status, 200);
    assert.equal(calls, 1);
  });

  it('retries a 429 then succeeds, honoring retry-after', async () => {
    let calls = 0;
    const delays: number[] = [];
    const r = await anthropicFetch(
      {},
      {
        fetchImpl: async () => ((calls += 1), calls === 1 ? res(429, { 'retry-after': '1' }) : res(200)),
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    assert.equal(r.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [1000]);
  });

  it('gives up after maxRetries on a persistent 429 and returns the last response', async () => {
    let calls = 0;
    const r = await anthropicFetch(
      {},
      { maxRetries: 2, jitter: () => 0, sleep: noSleep, fetchImpl: async () => ((calls += 1), res(429)) },
    );
    assert.equal(r.status, 429);
    assert.equal(calls, 3); // first attempt + 2 retries
  });

  it('does not retry a non-retryable 400', async () => {
    let calls = 0;
    const r = await anthropicFetch({}, { sleep: noSleep, fetchImpl: async () => ((calls += 1), res(400)) });
    assert.equal(r.status, 400);
    assert.equal(calls, 1);
  });

  it('retries a thrown network error then succeeds', async () => {
    let calls = 0;
    const r = await anthropicFetch(
      {},
      {
        jitter: () => 0,
        sleep: noSleep,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) throw new Error('ECONNRESET');
          return res(200);
        },
      },
    );
    assert.equal(r.status, 200);
    assert.equal(calls, 2);
  });

  it('rethrows when the network error persists past maxRetries', async () => {
    let calls = 0;
    await assert.rejects(
      anthropicFetch(
        {},
        {
          maxRetries: 1,
          jitter: () => 0,
          sleep: noSleep,
          fetchImpl: async () => {
            calls += 1;
            throw new Error('down');
          },
        },
      ),
    );
    assert.equal(calls, 2); // first attempt + 1 retry
  });
});
