# Contributing

1. Use Node.js 20 or newer and create a focused branch.
2. Run `npm ci` and `npm run verify` before opening a pull request.
3. Add a failing test before changing behavior. Never use real credentials or
   production-mutating requests in tests.
4. Keep `contract/sdk-operations.json` byte-identical to the canonical SDK
   manifest. After an approved contract update run `npm run operations:sync`.
5. Update both English and Russian documentation when public behavior changes.

By contributing, you agree that your contribution is licensed under MIT.
