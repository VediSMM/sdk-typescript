import assert from "node:assert/strict";
import test from "node:test";

import { VediSMMClient } from "../src/client.js";
import {
  ApiError,
  CancelledError,
  DecodeError,
  PreconditionFailedError,
  RateLimitError,
  RedirectError,
  TimeoutError,
  TransportError,
} from "../src/errors.js";

const json = (value: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });

test("builds encoded paths and query values and applies Bearer auth last", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = new VediSMMClient({
    accessToken: async () => "secret-token",
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return json({ data: { id: "a/b" } }, { headers: { "request-id": "req_123", etag: '"4"' } });
    },
  });

  const result = await client.call<{ data: { id: string } }>("getAccount", {
    path: { id: "a/b" },
    query: { cursor: "x y", active: true, tag: ["one", "two"] },
    headers: { Authorization: "Bearer attacker", "X-Trace": "trace" },
  });

  assert.equal(
    capturedUrl,
    "https://vedismm.ru/api/v1/accounts/a%2Fb?cursor=x+y&active=true&tag=one&tag=two",
  );
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("authorization"), "Bearer secret-token");
  assert.equal(headers.get("x-trace"), "trace");
  assert.equal(capturedInit?.redirect, "manual");
  assert.equal(result.requestId, "req_123");
  assert.equal(result.etag, '"4"');
});

test("serializes JSON and keeps an idempotency key stable across retries", async () => {
  const seenKeys: string[] = [];
  const seenBodies: string[] = [];
  let calls = 0;
  const client = new VediSMMClient({
    accessToken: "token",
    maxRetries: 2,
    retryBaseDelayMs: 1,
    random: () => 0,
    sleep: async () => undefined,
    fetch: async (_input, init) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      seenKeys.push(headers.get("idempotency-key") ?? "");
      seenBodies.push(String(init?.body));
      return calls === 1
        ? json({ code: "temporarily_unavailable", detail: "retry" }, { status: 503 })
        : json({ data: { id: 42 } }, { status: 201 });
    },
  });

  const result = await client.call("createPostDraft", {
    idempotencyKey: "stable-key",
    body: { title: "Launch", account_ids: [1] },
  });

  assert.equal(calls, 2);
  assert.deepEqual(seenKeys, ["stable-key", "stable-key"]);
  assert.equal(seenBodies[0], seenBodies[1]);
  assert.equal(new Headers({ "content-type": "application/json" }).get("content-type"), "application/json");
  assert.deepEqual(result.data, { data: { id: 42 } });
});

test("does not resolve or send credentials for public operations", async () => {
  let providerCalls = 0;
  const client = new VediSMMClient({
    accessToken: () => {
      providerCalls += 1;
      return "should-not-be-used";
    },
    fetch: async (_input, init) => {
      assert.equal(new Headers(init?.headers).has("authorization"), false);
      return json({ data: { status: "ok" } });
    },
  });
  await client.call("ping");
  assert.equal(providerCalls, 0);
});

test("does not retry an unsafe request without an idempotency key", async () => {
  let calls = 0;
  const client = new VediSMMClient({
    maxRetries: 3,
    sleep: async () => undefined,
    fetch: async () => {
      calls += 1;
      return json({ code: "temporarily_unavailable", detail: "retry" }, { status: 503 });
    },
  });

  await assert.rejects(client.call("login", { body: { email: "a@example.com", password: "x" } }), ApiError);
  assert.equal(calls, 1);
});

test("maps Problem Details into specific safe API errors", async () => {
  const rateLimited = new VediSMMClient({
    maxRetries: 0,
    fetch: async () =>
      json(
        { code: "rate_limited", detail: "Slow down", errors: { email: ["wait"] }, request_id: "req_body" },
        { status: 429, headers: { "content-type": "application/problem+json", "retry-after": "7", "request-id": "req_header" } },
      ),
  });
  await assert.rejects(
    rateLimited.call("ping"),
    (error: unknown) =>
      error instanceof RateLimitError &&
      error.status === 429 &&
      error.code === "rate_limited" &&
      error.requestId === "req_header" &&
      error.retryAfterMs === 7_000,
  );

  const precondition = new VediSMMClient({
    fetch: async () => json({ code: "precondition_failed", detail: "Reload" }, { status: 412 }),
  });
  await assert.rejects(precondition.call("updatePostDraft", { path: { id: 1 }, body: {} }), PreconditionFailedError);
});

test("rejects redirects before credentials can cross origins", async () => {
  const client = new VediSMMClient({
    accessToken: "top-secret",
    fetch: async (_input, init) => {
      assert.equal(init?.redirect, "manual");
      return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    },
  });

  await assert.rejects(
    client.call("getMe"),
    (error: unknown) => error instanceof RedirectError && !error.message.includes("top-secret"),
  );
});

test("distinguishes timeout, cancellation, transport, and decoding errors", async () => {
  const waitForAbort: typeof fetch = async (_input, init) =>
    await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });

  const timed = new VediSMMClient({ fetch: waitForAbort, timeoutMs: 5, maxRetries: 0 });
  await assert.rejects(timed.call("ping"), TimeoutError);

  const controller = new AbortController();
  controller.abort();
  const cancelled = new VediSMMClient({ fetch: waitForAbort, maxRetries: 0 });
  await assert.rejects(cancelled.call("ping", { signal: controller.signal }), CancelledError);

  const token = "never-print-this-token";
  const broken = new VediSMMClient({
    accessToken: token,
    maxRetries: 0,
    fetch: async () => {
      throw new Error(`network failed with Bearer ${token}`);
    },
  });
  await assert.rejects(
    broken.call("getMe"),
    (error: unknown) =>
      error instanceof TransportError &&
      !error.message.includes(token) &&
      !String(error.cause).includes(token),
  );

  const invalid = new VediSMMClient({
    fetch: async () => new Response("not-json", { headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(invalid.call("ping"), DecodeError);
});
