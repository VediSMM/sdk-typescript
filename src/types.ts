import type { OPERATIONS } from "./operations.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

export type OperationId = keyof typeof OPERATIONS;
export type PathParameters = Readonly<Record<string, string | number>>;
export type QueryValue = string | number | boolean | null | readonly (string | number | boolean)[];
export type QueryParameters = Readonly<Record<string, QueryValue | undefined>>;

export interface CallOptions {
  readonly path?: PathParameters;
  readonly query?: QueryParameters;
  readonly body?: JsonValue | BodyInit;
  readonly headers?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  readonly ifMatch?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface ApiResult<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
  readonly requestId?: string;
  readonly etag?: string;
}
