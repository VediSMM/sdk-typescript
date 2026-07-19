import type { JsonObject, JsonValue } from "./types.js";

export interface ApiEnvelope<T> {
  readonly data: T;
}

export interface CursorMeta {
  readonly next_cursor: string | null;
  readonly has_more: boolean;
  readonly limit: number;
}

export interface CursorEnvelope<T> {
  readonly data: readonly T[];
  readonly meta: CursorMeta;
  readonly links?: Readonly<{ readonly next?: string | null }>;
}

export interface ProblemDocument {
  readonly type?: string;
  readonly title?: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: JsonObject | readonly JsonValue[];
  readonly request_id?: string;
}

export interface ResourceIdentity {
  readonly id: string | number;
}
