# VediSMM SDK for TypeScript and JavaScript

Official, dependency-free TypeScript/JavaScript client for the user-facing
[VediSMM API v1](https://vedismm.ru/docs/api). It covers all 83 public user
operations. Administrative endpoints are intentionally absent.

> `0.1.x` is the pre-1.0 compatibility line. The source and Git tag are public;
> npm registry publication will follow after the first external integration.

[Русская версия](README.ru.md) · [Complete guide](docs/en/guide.md) ·
[OpenAPI contract](https://github.com/VediSMM/api-contract)

## Install

Until the npm release is enabled, install the immutable Git tag directly:

```bash
npm install github:VediSMM/sdk-typescript#v0.1.0
```

Node.js 20+ is supported. Modern browsers can use the ESM build and their
standard `fetch` implementation.

## Quick start

```ts
import { VediSMM, type ApiEnvelope } from "@vedismm/sdk";

interface Profile { id: number; email: string }

const sdk = new VediSMM({ accessToken: process.env.VEDISMM_TOKEN });
const response = await sdk.profile.getMe<ApiEnvelope<Profile>>();
console.log(response.data.data.id, response.requestId);
```

The client exposes domain services (`auth`, `profile`, `accounts`, `groups`,
`media`, `posts`, `jobs`, `analytics`, `webhooks`, and the remaining API
domains). Every OpenAPI `operationId` is a named camelCase method. The low-level
`sdk.call(operationId, options)` boundary remains available for advanced use.

## Safety defaults

- production base URL is HTTPS and redirects are never followed with credentials;
- public operations do not resolve or send a configured token;
- retries are bounded and limited to idempotent methods or a stable
  `Idempotency-Key`;
- Problem Details, rate limits, precondition failures, timeouts, cancellation,
  decoding failures, and network failures have distinct error types;
- secrets are recursively redacted from diagnostics;
- uploads accept `FormData`, downloads remain streaming, and webhook signatures
  are verified against the exact raw bytes.

Run the checked read-only example from [examples/quickstart.ts](examples/quickstart.ts).
See the [complete English guide](docs/en/guide.md) for pagination, jobs, ETags,
idempotency, media, webhooks, and custom transports.

## Development

```bash
npm ci
npm run verify
```

Contract version: `1.0.0` · operation count: `83` · contract SHA-256:
`0318da9e05a622860cb2cf154c6bca50e931349b3e7a8df54d76173ad961c521`.

MIT licensed. Security reports: [SECURITY.md](SECURITY.md).
