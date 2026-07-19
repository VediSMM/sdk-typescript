import assert from "node:assert/strict";
import test from "node:test";

import { OPERATIONS } from "../src/operations.js";
import { SERVICE_OPERATION_IDS, VediSMM } from "../src/services.js";

test("assigns every operation to exactly one public domain service", () => {
  const owned = Object.values(SERVICE_OPERATION_IDS).flat();
  assert.equal(owned.length, 83);
  assert.equal(new Set(owned).size, 83);
  assert.deepEqual([...owned].sort(), Object.keys(OPERATIONS).sort());
});

test("exposes named service methods that delegate to the exact operation", async () => {
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const sdk = new VediSMM({
    accessToken: "token",
    fetch: async (input, init) => {
      calls.push({ url: String(input), method: String(init?.method), body: String(init?.body) });
      return new Response(JSON.stringify({ data: { id: 7 } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });

  const result = await sdk.posts.createPostDraft<{ data: { id: number } }>({
    idempotencyKey: "post-1",
    body: { title: "Post", account_ids: [2] },
  });

  assert.equal(result.data.data.id, 7);
  assert.deepEqual(calls, [
    {
      url: "https://vedismm.ru/api/v1/posts",
      method: "POST",
      body: '{"title":"Post","account_ids":[2]}',
    },
  ]);
  assert.equal(typeof sdk.webhooks.retryWebhookDelivery, "function");
  assert.equal(typeof sdk.system.getOpenApi, "function");
});
