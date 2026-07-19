import { CancelledError, ConfigurationError, TimeoutError, VediSMMError } from "./errors.js";
import type { ApiResult, CallOptions, OperationId, QueryParameters } from "./types.js";

export interface OperationCaller {
  call<T = unknown>(operationId: OperationId, options?: CallOptions): Promise<ApiResult<T>>;
}

export interface CursorPage<T> {
  readonly data: readonly T[];
  readonly meta: {
    readonly next_cursor: string | null;
    readonly has_more: boolean;
    readonly limit: number;
  };
}

export interface PublicationJob {
  readonly id: string;
  readonly status: "queued" | "running" | "succeeded" | "partially_succeeded" | "failed" | "cancelled";
  readonly [key: string]: unknown;
}

export class JobFailedError extends VediSMMError {
  public readonly job: PublicationJob;

  public constructor(job: PublicationJob) {
    super(`VediSMM publication job ${job.id} ended with status ${job.status}`);
    this.job = job;
  }
}

export interface WaitForJobOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly signal?: AbortSignal;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly now?: () => number;
}

const helperSleep = async (milliseconds: number, signal?: AbortSignal): Promise<void> => {
  if (signal?.aborted) throw new CancelledError("VediSMM helper was cancelled");
  await new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new CancelledError("VediSMM helper was cancelled"));
    };
    const finish = (): void => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
};

export async function* paginate<T>(
  client: OperationCaller,
  operationId: OperationId,
  options: CallOptions = {},
): AsyncGenerator<T, void, void> {
  let cursor = typeof options.query?.cursor === "string" ? options.query.cursor : undefined;
  const seen = new Set<string>();
  if (cursor !== undefined) seen.add(cursor);

  while (true) {
    if (options.signal?.aborted) throw new CancelledError("VediSMM pagination was cancelled");
    const query: QueryParameters = {
      ...options.query,
      ...(cursor === undefined ? {} : { cursor }),
    };
    const response = await client.call<CursorPage<T>>(operationId, { ...options, query });
    const page = response.data;
    if (!Array.isArray(page.data) || page.meta === undefined) {
      throw new VediSMMError("VediSMM API returned an invalid cursor page");
    }
    for (const item of page.data) yield item;
    const next = page.meta.next_cursor;
    if (next === null) return;
    if (typeof next !== "string" || next.length === 0) {
      throw new VediSMMError("VediSMM API returned an invalid next cursor");
    }
    if (seen.has(next)) throw new VediSMMError("VediSMM API cursor loop detected");
    seen.add(next);
    cursor = next;
  }
}

export const waitForJob = async (
  client: OperationCaller,
  jobId: string,
  options: WaitForJobOptions = {},
): Promise<PublicationJob> => {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new ConfigurationError("timeoutMs must be positive");
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new ConfigurationError("pollIntervalMs must be positive");
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? helperSleep;
  const deadline = now() + timeoutMs;

  while (true) {
    if (options.signal?.aborted) throw new CancelledError("VediSMM job wait was cancelled");
    const response = await client.call<{ readonly data: PublicationJob }>("getPublicationJob", {
      path: { job_id: jobId },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const job = response.data.data;
    if (job.status === "succeeded" || job.status === "partially_succeeded") return job;
    if (job.status === "failed" || job.status === "cancelled") throw new JobFailedError(job);
    const remaining = deadline - now();
    if (remaining <= 0) throw new TimeoutError(`VediSMM publication job ${jobId} did not finish in time`);
    await sleep(Math.min(pollIntervalMs, remaining), options.signal);
  }
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createIdempotencyKey = (
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
): string => {
  const value = randomUUID();
  if (!UUID_V4.test(value)) throw new ConfigurationError("idempotency key generator must return a UUID v4");
  return value.toLowerCase();
};
