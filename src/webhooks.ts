import { ConfigurationError } from "./errors.js";

export interface ReplayStore {
  claim(eventId: string): boolean | Promise<boolean>;
}

export interface WebhookVerificationOptions {
  readonly secret: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly body: Uint8Array | ArrayBuffer;
  readonly toleranceSeconds?: number;
  readonly nowMs?: number;
  readonly eventId?: string;
  readonly replayStore?: ReplayStore;
}

const HEX_SIGNATURE = /^v1=([0-9a-f]{64})$/;

const decodeHex = (hex: string): Uint8Array => {
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
};

const constantTimeEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

export const verifyWebhookSignature = async (options: WebhookVerificationOptions): Promise<boolean> => {
  if (options.secret.length === 0) throw new ConfigurationError("webhook secret must not be empty");
  if (!/^\d{10,}$/.test(options.timestamp)) return false;
  const match = HEX_SIGNATURE.exec(options.signature);
  if (match?.[1] === undefined) return false;
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  if (!Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 0) {
    throw new ConfigurationError("webhook toleranceSeconds must be a non-negative integer");
  }
  const timestampMs = Number(options.timestamp) * 1_000;
  const nowMs = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(timestampMs) || Math.abs(nowMs - timestampMs) > toleranceSeconds * 1_000) return false;

  const body = options.body instanceof Uint8Array ? options.body : new Uint8Array(options.body);
  const prefix = new TextEncoder().encode(`${options.timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const actual = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, signed));
  if (!constantTimeEqual(actual, decodeHex(match[1]))) return false;

  if (options.eventId !== undefined && options.replayStore !== undefined) {
    return await options.replayStore.claim(options.eventId);
  }
  return true;
};
