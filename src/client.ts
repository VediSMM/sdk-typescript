import {
  ApiError,
  CancelledError,
  ConfigurationError,
  DecodeError,
  PreconditionFailedError,
  RateLimitError,
  RedirectError,
  TimeoutError,
  TransportError,
  redact,
  redactUnknown,
  type ProblemDetails,
} from "./errors.js";
import { OPERATIONS } from "./operations.js";
import type { ApiResult, CallOptions, JsonValue, OperationId, QueryParameters } from "./types.js";

export const DEFAULT_BASE_URL = "https://vedismm.ru/api/v1";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type AccessTokenProvider = string | (() => string | Promise<string>);
export type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

export interface VediSMMClientOptions {
  readonly accessToken?: AccessTokenProvider;
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  readonly retryBaseDelayMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxErrorBytes?: number;
  readonly random?: () => number;
  readonly sleep?: Sleep;
}

interface PreparedBody {
  readonly body: BodyInit | undefined;
  readonly json: boolean;
  readonly reusable: boolean;
}

interface AbortContext {
  readonly signal: AbortSignal;
  readonly didTimeout: () => boolean;
  readonly cleanup: () => void;
}

const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(["get", "put", "delete"]);

const positiveInteger = (name: string, value: number, allowZero = false): number => {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new ConfigurationError(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
  return value;
};

const normalizeBaseUrl = (raw: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigurationError("baseUrl must be an absolute HTTP(S) URL");
  }
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
    throw new ConfigurationError("baseUrl must use HTTPS (HTTP is allowed only for localhost)");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError("baseUrl must not contain credentials, query, or fragment");
  }
  return parsed.toString().replace(/\/$/, "");
};

const defaultSleep: Sleep = async (milliseconds, signal) => {
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const finish = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
};

const createAbortContext = (external: AbortSignal | undefined, timeoutMs: number): AbortContext => {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = (): void => controller.abort(external?.reason);
  if (external?.aborted) abortFromExternal();
  else external?.addEventListener("abort", abortFromExternal, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("timed out", "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", abortFromExternal);
    },
  };
};

const renderPath = (template: string, parameters: CallOptions["path"]): string => {
  const provided = parameters ?? {};
  const used = new Set<string>();
  const path = template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = provided[name];
    if (value === undefined || value === null || String(value).length === 0) {
      throw new ConfigurationError(`missing path parameter: ${name}`);
    }
    used.add(name);
    return encodeURIComponent(String(value));
  });
  const unused = Object.keys(provided).filter((name) => !used.has(name));
  if (unused.length > 0) throw new ConfigurationError(`unused path parameter: ${unused.join(", ")}`);
  return path;
};

const appendQuery = (url: URL, query: QueryParameters | undefined): void => {
  if (query === undefined) return;
  for (const [name, raw] of Object.entries(query)) {
    if (raw === undefined) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) url.searchParams.append(name, value === null ? "" : String(value));
  }
};

const isRawBody = (body: JsonValue | BodyInit): body is BodyInit =>
  body instanceof FormData ||
  body instanceof Blob ||
  body instanceof URLSearchParams ||
  body instanceof ArrayBuffer ||
  ArrayBuffer.isView(body) ||
  body instanceof ReadableStream;

const prepareBody = (body: CallOptions["body"], supportsJson: boolean): PreparedBody => {
  if (body === undefined) return { body: undefined, json: false, reusable: true };
  if (supportsJson && !isRawBody(body)) {
    return { body: JSON.stringify(body), json: true, reusable: true };
  }
  return { body: body as BodyInit, json: false, reusable: !(body instanceof ReadableStream) };
};

const retryAfterMilliseconds = (headers: Headers): number | undefined => {
  const value = headers.get("retry-after");
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) return Math.min(Number(value) * 1_000, 30_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, Math.min(date - Date.now(), 30_000));
};

const readBounded = async (response: Response, limit: number): Promise<Uint8Array> => {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel("response exceeds configured byte limit");
        throw new DecodeError(`response exceeds configured limit of ${limit} bytes`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const decodeJson = (bytes: Uint8Array, secrets: readonly string[], requestId?: string): unknown => {
  const text = new TextDecoder().decode(bytes);
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new DecodeError("VediSMM API returned invalid JSON", {
      cause: new Error(redact(cause instanceof Error ? cause.message : String(cause), secrets)),
      ...(requestId === undefined ? {} : { requestId }),
    });
  }
};

const problemFrom = (
  status: number,
  parsed: unknown,
  headers: Headers,
  secrets: readonly string[],
): ProblemDetails => {
  const object = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const requestId = headers.get("request-id") ?? (typeof object.request_id === "string" ? object.request_id : undefined);
  const code = typeof object.code === "string" ? redact(object.code, secrets) : `http_${status}`;
  const detail = typeof object.detail === "string" ? redact(object.detail, secrets) : `HTTP ${status}`;
  const retryAfterMs = retryAfterMilliseconds(headers);
  return {
    status,
    code,
    detail,
    ...(object.errors === undefined ? {} : { errors: redactUnknown(object.errors, secrets) }),
    ...(requestId === undefined ? {} : { requestId }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
};

export class VediSMMClient {
  readonly #accessToken: AccessTokenProvider | undefined;
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #retryBaseDelayMs: number;
  readonly #maxResponseBytes: number;
  readonly #maxErrorBytes: number;
  readonly #random: () => number;
  readonly #sleep: Sleep;

  public constructor(options: VediSMMClientOptions = {}) {
    this.#accessToken = options.accessToken;
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = positiveInteger("timeoutMs", options.timeoutMs ?? 30_000);
    this.#maxRetries = positiveInteger("maxRetries", options.maxRetries ?? 2, true);
    this.#retryBaseDelayMs = positiveInteger("retryBaseDelayMs", options.retryBaseDelayMs ?? 200);
    this.#maxResponseBytes = positiveInteger("maxResponseBytes", options.maxResponseBytes ?? 16 * 1_024 * 1_024);
    this.#maxErrorBytes = positiveInteger("maxErrorBytes", options.maxErrorBytes ?? 64 * 1_024);
    this.#random = options.random ?? Math.random;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  public get baseUrl(): string {
    return this.#baseUrl;
  }

  public toString(): string {
    return `VediSMMClient(${this.#baseUrl})`;
  }

  public async call<T = unknown>(operationId: OperationId, options: CallOptions = {}): Promise<ApiResult<T>> {
    if (options.signal?.aborted) throw new CancelledError("VediSMM API request was cancelled");
    const operation = OPERATIONS[operationId];
    const url = new URL(`${this.#baseUrl}${renderPath(operation.path, options.path)}`);
    appendQuery(url, options.query);
    const token = operation.authenticated ? await this.#resolveToken() : undefined;
    const secrets = token === undefined ? [] : [token];
    const requestContentTypes: readonly string[] = operation.requestContentTypes;
    const prepared = prepareBody(options.body, requestContentTypes.includes("application/json"));
    const canRetry =
      prepared.reusable && (IDEMPOTENT_METHODS.has(operation.method) || options.idempotencyKey !== undefined);

    for (let attempt = 0; ; attempt += 1) {
      const headers = this.#headers(options, token, prepared.json);
      const abort = createAbortContext(options.signal, options.timeoutMs ?? this.#timeoutMs);
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: operation.method.toUpperCase(),
          headers,
          ...(prepared.body === undefined ? {} : { body: prepared.body }),
          signal: abort.signal,
          redirect: "manual",
        });
      } catch (cause) {
        abort.cleanup();
        if (options.signal?.aborted) throw new CancelledError("VediSMM API request was cancelled");
        if (abort.didTimeout()) throw new TimeoutError("VediSMM API request timed out");
        if (canRetry && attempt < this.#maxRetries) {
          await this.#wait(attempt, undefined, options.signal);
          continue;
        }
        const message = redact(cause instanceof Error ? cause.message : String(cause), secrets);
        throw new TransportError(`VediSMM API transport failed: ${message}`, { cause: new Error(message) });
      } finally {
        abort.cleanup();
      }

      const requestId = response.headers.get("request-id") ?? undefined;
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        throw new RedirectError(response.status, requestId);
      }
      if (canRetry && attempt < this.#maxRetries && RETRY_STATUSES.has(response.status)) {
        const retryAfter = retryAfterMilliseconds(response.headers);
        await response.body?.cancel().catch(() => undefined);
        await this.#wait(attempt, retryAfter, options.signal);
        continue;
      }
      return await this.#decode<T>(response, secrets);
    }
  }

  async #resolveToken(): Promise<string | undefined> {
    if (this.#accessToken === undefined) return undefined;
    let token: string;
    try {
      token = typeof this.#accessToken === "function" ? await this.#accessToken() : this.#accessToken;
    } catch {
      throw new ConfigurationError("access token provider failed");
    }
    if (token.length === 0 || /[\r\n]/.test(token)) throw new ConfigurationError("access token is empty or invalid");
    return token;
  }

  #headers(options: CallOptions, token: string | undefined, json: boolean): Headers {
    const headers = new Headers(options.headers);
    for (const protectedName of ["authorization", "idempotency-key", "if-match", "host", "content-length"]) {
      headers.delete(protectedName);
    }
    headers.set("accept", "application/json");
    if (json) headers.set("content-type", "application/json");
    if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
    if (options.idempotencyKey !== undefined) {
      if (options.idempotencyKey.length === 0 || /[\r\n]/.test(options.idempotencyKey)) {
        throw new ConfigurationError("idempotency key is empty or invalid");
      }
      headers.set("idempotency-key", options.idempotencyKey);
    }
    if (options.ifMatch !== undefined) headers.set("if-match", options.ifMatch);
    return headers;
  }

  async #wait(attempt: number, retryAfter: number | undefined, signal: AbortSignal | undefined): Promise<void> {
    const exponential = Math.min(this.#retryBaseDelayMs * 2 ** attempt, 5_000);
    const jittered = Math.round(exponential * (0.5 + Math.min(1, Math.max(0, this.#random())) * 0.5));
    try {
      await this.#sleep(retryAfter ?? jittered, signal);
    } catch (cause) {
      if (signal?.aborted) throw new CancelledError("VediSMM API request was cancelled during retry delay");
      throw new TransportError("VediSMM API retry delay failed", { cause });
    }
  }

  async #decode<T>(response: Response, secrets: readonly string[]): Promise<ApiResult<T>> {
    const requestId = response.headers.get("request-id") ?? undefined;
    const etag = response.headers.get("etag") ?? undefined;
    if (response.status === 204 || response.status === 205) {
      return {
        data: undefined as T,
        status: response.status,
        headers: response.headers,
        ...(requestId === undefined ? {} : { requestId }),
        ...(etag === undefined ? {} : { etag }),
      };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok) {
      const bytes = await readBounded(response, this.#maxErrorBytes);
      let parsed: unknown;
      try {
        parsed = bytes.length === 0 ? undefined : JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        parsed = undefined;
      }
      const problem = problemFrom(response.status, parsed, response.headers, secrets);
      if (response.status === 429) throw new RateLimitError(problem);
      if (response.status === 412) throw new PreconditionFailedError(problem);
      throw new ApiError(problem);
    }

    let data: unknown;
    if (contentType.includes("json")) {
      data = decodeJson(await readBounded(response, this.#maxResponseBytes), secrets, requestId);
    } else {
      data = response.body;
    }
    return {
      data: data as T,
      status: response.status,
      headers: response.headers,
      ...(requestId === undefined ? {} : { requestId }),
      ...(etag === undefined ? {} : { etag }),
    };
  }
}
