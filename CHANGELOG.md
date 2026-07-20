# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and Semantic Versioning.

## [0.1.1] - 2026-07-20

### Fixed

- Authenticated calls now send the same in-memory credential through both
  `Authorization: Bearer` and the API's `X-API-Token` proxy fallback.
- `X-API-Token` is SDK-managed so custom headers cannot replace the credential.

## [0.1.0] - 2026-07-19

### Added

- Complete 83-operation user API v1 catalog and named domain services.
- Secure ESM fetch transport, typed Problem Details errors, bounded retry policy,
  token redaction, multipart uploads, and streaming downloads.
- Cursor pagination, publication-job polling, idempotency, ETag support, and
  raw-byte webhook signature/replay helpers.
- English/Russian documentation, checked example, tests, package inspection,
  and pinned minimal-permission CI.
