export interface ProblemDetails {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly errors?: unknown;
  readonly requestId?: string;
  readonly retryAfterMs?: number;
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /("(?:access_token|refresh_token|token|secret|password)"\s*:\s*")[^"]*(")/gi,
  /((?:access_token|refresh_token|token|secret|password)=)[^&\s]*/gi,
];

export const redact = (value: string, secrets: readonly string[] = []): string => {
  let safe = value;
  for (const secret of secrets) {
    if (secret.length > 0) safe = safe.split(secret).join("[REDACTED]");
  }
  for (const pattern of SECRET_PATTERNS) {
    safe = safe.replace(pattern, (_match, prefix?: string, suffix?: string) =>
      prefix ? `${prefix}[REDACTED]${suffix ?? ""}` : "Bearer [REDACTED]",
    );
  }
  return safe.slice(0, 4_096);
};

export const redactUnknown = (value: unknown, secrets: readonly string[] = [], depth = 0): unknown => {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactUnknown(item, secrets, depth + 1));
  if (value !== null && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      safe[key] = /token|secret|password|authorization/i.test(key)
        ? "[REDACTED]"
        : redactUnknown(item, secrets, depth + 1);
    }
    return safe;
  }
  return value;
};

export class VediSMMError extends Error {
  public readonly requestId: string | undefined;

  public constructor(message: string, options: { readonly cause?: unknown; readonly requestId?: string } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.requestId = options.requestId;
  }
}

export class ConfigurationError extends VediSMMError {}
export class TransportError extends VediSMMError {}
export class TimeoutError extends TransportError {}
export class CancelledError extends TransportError {}
export class DecodeError extends VediSMMError {}
export class RedirectError extends VediSMMError {
  public readonly status: number;

  public constructor(status: number, requestId?: string) {
    super(`VediSMM API redirect rejected (${status})`, requestId === undefined ? {} : { requestId });
    this.status = status;
  }
}

export class ApiError extends VediSMMError {
  public readonly status: number;
  public readonly code: string;
  public readonly detail: string;
  public readonly errors: unknown;
  public readonly retryAfterMs: number | undefined;

  public constructor(problem: ProblemDetails) {
    super(
      `VediSMM API error ${problem.status} (${problem.code}): ${problem.detail}`,
      problem.requestId === undefined ? {} : { requestId: problem.requestId },
    );
    this.status = problem.status;
    this.code = problem.code;
    this.detail = problem.detail;
    this.errors = problem.errors;
    this.retryAfterMs = problem.retryAfterMs;
  }
}

export class RateLimitError extends ApiError {}
export class PreconditionFailedError extends ApiError {}
