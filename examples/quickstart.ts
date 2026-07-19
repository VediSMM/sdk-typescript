import { VediSMM, createIdempotencyKey, type ApiEnvelope } from "../src/index.js";

interface Profile {
  readonly id: number;
  readonly email: string;
}

const token = process.env.VEDISMM_TOKEN;
if (token === undefined) {
  console.log("Set VEDISMM_TOKEN to run the read-only quickstart.");
} else {
  const sdk = new VediSMM({ accessToken: token });
  const profile = await sdk.profile.getMe<ApiEnvelope<Profile>>();
  console.log(`Authenticated as user ${profile.data.data.id}.`);
  console.log(`Fresh idempotency key: ${createIdempotencyKey()}`);
}
