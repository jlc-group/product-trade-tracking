# API end-to-end tests

`e2e.mjs` exercised every route in `../ENDPOINTS.md` (349 checks passing on 2026-10-01) against the
old demo dataset. It **wipes and refills the schema it runs against**, so it is now disabled unless
`E2E_DATABASE_URL` is set — it must only ever run against a throw-away PostgreSQL, never the real
`flowtrade` data.

To do: make it start its own disposable database (e.g. `docker run --rm postgres:16`), apply
`prisma migrate deploy`, create its fixtures through the API (the demo dataset was removed from
the app), and tear everything down afterwards.

It also predates multi-store proposals (2026-10-05): it still expects `POST /proposals` with two
stores to return two proposals, `storeId` / `store` on proposals and `{ storeId }` for duplicate —
the API now returns one proposal with `storeIds` / `stores`, and duplicate takes `{ storeIds }`.
