# Security policy

Security fixes are provided for the latest `0.1.x` release until a stable 1.x
policy is announced.

Do not open a public issue for a suspected vulnerability. Email
`support@vedismm.ru` with the affected version, impact, reproduction steps, and
whether disclosure is time-sensitive. Do not include real access tokens,
refresh tokens, personal tokens, webhook secrets, or user data. We will
acknowledge a complete report within three business days.

The SDK does not persist credentials or provide a credential store. Applications
remain responsible for secret storage, webhook replay persistence, transport
logging, and timely dependency/runtime updates.
