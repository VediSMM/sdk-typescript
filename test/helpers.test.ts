import assert from "node:assert/strict";
import test from "node:test";

import { CancelledError, TimeoutError } from "../src/errors.js";
import {
  JobFailedError,
  createIdempotencyKey,
  paginate,
  waitForJob,
  type CursorPage,
  type OperationCaller,
  type PublicationJob,
} from "../src/helpers.js";
import type { CallOptions, OperationId } from "../src/types.js";
import { verifyWebhookSignature } from "../src/webhooks.js";

const mockCaller = (
  handler: (operationId: OperationId, options: CallOptions) => unknown | Promise<unknown>,
): OperationCaller => ({
  call: async <T>(operationId: OperationId, options: CallOptions = {}) => ({
    data: (await handler(operationId, options)) as T,
    status: 200,
    headers: new Headers(),
  }),
});

test("follows only server-provided cursors and rejects cursor loops", async () => {
  const cursors: Array<string | undefined> = [];
  const pages: Array<CursorPage<number>> = [
    { data: [1, 2], meta: { next_cursor: "server-next", has_more: true, limit: 2 } },
    { data: [3], meta: { next_cursor: null, has_more: false, limit: 2 } },
  ];
  const client = mockCaller((_operationId, options) => {
      cursors.push(options.query?.cursor as string | undefined);
      const page = pages.shift();
      if (page === undefined) throw new Error("unexpected page request");
      return page;
  });

  const items: number[] = [];
  for await (const item of paginate<number>(client, "listPosts", { query: { limit: 2 } })) items.push(item);
  assert.deepEqual(items, [1, 2, 3]);
  assert.deepEqual(cursors, [undefined, "server-next"]);

  const looping = mockCaller(() => ({ data: [1], meta: { next_cursor: "same", has_more: true, limit: 1 } }));
  await assert.rejects(
    async () => {
      for await (const _item of paginate<number>(looping, "listPosts")) {
        // Consume the iterator.
      }
    },
    /cursor loop/i,
  );
});

test("waits for jobs with finite timeout, cancellation, and visible terminal failure", async () => {
  let now = 0;
  const statuses: Array<PublicationJob["status"]> = ["queued", "running", "succeeded"];
  const successful = mockCaller(() => {
    const status = statuses.shift();
    if (status === undefined) throw new Error("unexpected job poll");
    return { data: { id: "job", status } };
  });
  const job = await waitForJob(successful, "job", {
    timeoutMs: 100,
    pollIntervalMs: 10,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  });
  assert.equal(job.status, "succeeded");

  const failed = mockCaller(() => ({ data: { id: "job", status: "failed" } }));
  await assert.rejects(waitForJob(failed, "job"), JobFailedError);

  now = 0;
  const pending = mockCaller(() => ({ data: { id: "job", status: "queued" } }));
  await assert.rejects(
    waitForJob(pending, "job", {
      timeoutMs: 5,
      pollIntervalMs: 5,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    }),
    TimeoutError,
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForJob(pending, "job", { signal: controller.signal }), CancelledError);
});

test("creates validated UUID idempotency keys", () => {
  const value = createIdempotencyKey(() => "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(value, "123e4567-e89b-42d3-a456-426614174000");
  assert.throws(() => createIdempotencyKey(() => "predictable"), /UUID v4/);
});

test("verifies exact raw webhook bytes, timestamp tolerance, and replay IDs", async () => {
  const body = new TextEncoder().encode('{"event":"post.published","id":"evt_fixture_01"}');
  const seen = new Set<string>();
  const replayStore = {
    claim: async (eventId: string) => {
      if (seen.has(eventId)) return false;
      seen.add(eventId);
      return true;
    },
  };
  const options = {
    secret: "whsec_test_vedismm_fixture",
    timestamp: "1784361600",
    signature: "v1=a2797dd81ea7a742832102bb7f3ec5f95d1d9b5fa9da1098f3a21ac39fab647d",
    body,
    eventId: "evt_fixture_01",
    replayStore,
    nowMs: 1_784_361_600_000,
  };
  assert.equal(await verifyWebhookSignature(options), true);
  assert.equal(await verifyWebhookSignature(options), false);
  assert.equal(await verifyWebhookSignature({ ...options, eventId: "evt_2", body: new TextEncoder().encode("changed") }), false);
  assert.equal(await verifyWebhookSignature({ ...options, eventId: "evt_3", nowMs: 1_784_362_000_001 }), false);
});

const _typeCheck: PublicationJob = { id: "job", status: "queued" };
assert.equal(_typeCheck.id, "job");
