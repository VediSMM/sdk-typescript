# TypeScript SDK guide

## Configuration and authentication

`VediSMM` defaults to `https://vedismm.ru/api/v1`. Pass a token string or an
async provider; the SDK never persists it. The provider is called once per
authenticated logical request and is not called for `ping`, registration, or
other public operations.

Authenticated calls send the same in-memory credential through both the
standard `Authorization: Bearer` header and VediSMM's `X-API-Token` fallback.
This keeps authentication working behind proxies that remove `Authorization`;
the API gives `Authorization` priority. Both headers are SDK-managed and must
never be logged.

```ts
const sdk = new VediSMM({
  accessToken: () => tokenVault.read(),
  timeoutMs: 30_000,
  maxRetries: 2,
});
```

A custom `baseUrl` must be HTTPS. Plain HTTP is accepted only for localhost
tests. User info, query strings, and fragments in `baseUrl` are rejected.
Authenticated requests use `redirect: "manual"`; the SDK does not forward a
Bearer token to another origin.

## Calling operations

Every canonical operation is exposed under one domain service using its stable
OpenAPI `operationId`:

```ts
await sdk.posts.createPostDraft({
  idempotencyKey: createIdempotencyKey(),
  body: { title: "Launch", content: "Text", account_ids: [42] },
});

await sdk.posts.updatePostDraft({
  path: { id: 101 },
  ifMatch: '"3"',
  body: { title: "Revised" },
});
```

Path values are percent-encoded. Query arrays are emitted as repeated keys.
Custom `Authorization`, `Host`, `Content-Length`, `Idempotency-Key`, and
`If-Match` headers cannot override the safe client values.

## Errors

Catch the narrowest useful class: `RateLimitError`,
`PreconditionFailedError`, `TimeoutError`, `CancelledError`, `DecodeError`,
`RedirectError`, `TransportError`, or the general `ApiError`. API errors retain
`status`, stable `code`, safe `detail`, validation `errors`, `requestId`, and a
bounded `retryAfterMs`. Error messages, nested validation data, and transport
causes redact known credentials.

```ts
try {
  await sdk.profile.getMe();
} catch (error) {
  if (error instanceof ApiError) console.error(error.code, error.requestId);
}
```

## Idempotency and retries

Use `createIdempotencyKey()` once per logical mutation and keep it if your own
application retries later. The SDK preserves the same key across its bounded
attempts. Unsafe requests without a key are never retried. Safe/idempotent
requests retry only selected transient statuses and transport failures, honor a
bounded `Retry-After`, and use exponential backoff with jitter.

## ETag concurrency

Save `result.etag` and pass it back as `ifMatch` for versioned updates. A `412`
becomes `PreconditionFailedError`; re-read the resource before deciding whether
to retry.

## Pagination

`paginate` follows only `meta.next_cursor` returned by the server, detects cursor
loops, and supports cancellation:

```ts
for await (const post of paginate<Post>(sdk, "listPosts", {
  query: { limit: 50 },
  signal,
})) {
  consume(post);
}
```

## Media

Pass `FormData` to `uploadMedia`; the runtime supplies the multipart boundary.
Do not set `Content-Type` manually. Binary download methods return a
`ReadableStream<Uint8Array>` in `result.data`, so callers can stream to disk or a
browser sink without buffering the complete file.

## Jobs

`waitForJob` polls `getPublicationJob` with a finite timeout and cancellation.
It returns `succeeded` and `partially_succeeded` terminal states, and throws
`JobFailedError` for `failed` or `cancelled` without hiding the final job object.

## Webhooks

Pass the exact raw request bytes, not parsed/re-encoded JSON, to
`verifyWebhookSignature`. The helper checks the `v1=` HMAC-SHA256 signature in
constant time and enforces a timestamp tolerance. For replay protection, supply
an atomic `ReplayStore.claim(eventId)` implementation backed by your database or
cache; it must return `true` only for a newly claimed ID.

## Custom transport and observability

Provide a `fetch` implementation for proxies, tracing, or deterministic tests.
It receives a fully encoded URL and safe request options. Never log the raw
`Authorization` or webhook-secret values in the custom transport.
