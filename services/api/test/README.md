# API test harness

The API test gate has two complementary layers:

1. **Workers Vitest integration** — `@cloudflare/vitest-plugin` runs Worker/D1 tests inside the local `workerd`/Miniflare runtime. Tests live in this directory and migrations are applied to isolated test D1 storage before each test file.
2. **Wrangler migration verification** — `pnpm run d1:verify:local` (owned by Issue #11) verifies the actual Wrangler local migration workflow against a fresh persisted local D1 database.

Run both gates from the API package:

```bash
pnpm --filter @yuke/api test
```

Run only the fast Worker/D1 Vitest suite:

```bash
pnpm --filter @yuke/api test:worker
```

## Conventions

- Use only Synthetic Data in tests.
- Prefer stable domain error markers such as `SLOT_OVERLAP` over matching full runtime error strings.
- D1 tests must use the canonical SQL files under `../migrations`; do not duplicate schema SQL in fixtures.
- Keep HTTP behavior tests separate from D1 constraint tests.
- CI executes the root `pnpm test`, so this package gate is merge-blocking whenever the repository CI is required.


## Phase 4 Booking Core E2E Gate

`reservation/booking-core-e2e.test.mjs` is the merge-blocking cross-surface gate for Booking Core. It intentionally exercises the same Worker through both authentication surfaces instead of adding a separate browser E2E framework:

- Mini/user HTTP contract with project Bearer Token;
- Admin HTTP contract with synthetic Cloudflare Access JWT + Space RBAC;
- the real D1 migration schema and final database constraints;
- state visibility after create, Admin modification, user refresh, and cancellation;
- the capacity=1 concurrency race, cutoff rules, frozen Slot behavior, and Admin move conflicts.

UI adapters remain covered in `apps/miniprogram/test` and `apps/admin/test`; the root `pnpm test` runs all of these gates together.
