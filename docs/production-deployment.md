# FlowTrade production through We-Platform

Release source: `jlc-group/product-trade-tracking`, branch `main`.
Controller: `D:/AI_WORKSPACE/Production/we-platform`, signed GitHub endpoint
`https://api.wejlc.com/api/deploy/webhook` (push events only, SSL verification enabled).

Production root: `D:/AI_WORKSPACE/Production/product-trade-tracking`.
PM2 service: `product-trade-tracking-prod`; Node entrypoint `scripts/start-production.mjs`.
Bind: `127.0.0.1:3083`, one origin serving the Vite SPA and NestJS `/api/v1`.
Database: PostgreSQL `trade_product`, schema `flowtrade`.

The Windows-compatible build is `npm ci --ignore-scripts`, then `npm run build`.
The controller uses `scripts/product_trade_runtime.py` rather than the generic recursive
Prisma scanner: migrations must use `apps/api/prisma.config.ts`, not the design schema under `docs/`.

Deploy first builds and typechecks the pinned revision in `.deploy-checkouts` without
database writes. It copies compiled artifacts into a new Production `releases/<sha>-<timestamp>`
directory, installs dependencies, takes a scoped database backup, runs `db:migrate` and
idempotent `db:bootstrap`, and probes port `13083` before activation. It switches `current.json`,
restarts only FlowTrade, and checks DB/schema/revision plus the SPA before success.
Activation failure restores the previous pointer and verifies the previous application.
Database migrations are not reversed automatically; the pre-migration backup remains available.

Runtime `.env`, initial Admin credential, logs, backups and past releases are retained
outside source synchronization. Required `.env` keys: `DATABASE_URL`, `WEB_ORIGIN`,
`PORT=3083`, `HOST=127.0.0.1`, `NODE_ENV=production`, `DB_SCHEMA=flowtrade`,
`SESSION_COOKIE=__Host-ft_sid`, and `ADMIN_EMAIL` for first bootstrap.
Secrets are local only. The initial password is saved in Production `.admin-initial-password`
and must be changed at first sign-in.

Public domain: `https://product-trade.wejlc.com`. The first Admin email is awaiting the owner's value.
The dedicated tunnel config is tracked in We-Platform. Discord uses its existing deploy notifier,
including commit, branch, build, local health and public URL.

Health endpoint: `/api/v1/health`, including the exact deployed revision.
Do not run the old `test:e2e` against Production: it resets its target schema.

Rollback application: set `current.json` to the previous object recorded in `last-deploy.json`,
restart `product-trade-tracking-prod`, then verify `/api/v1/health` and assets.
Database restore is a separate operator action after reviewing the migration and backup.

Setup checkpoint (2026-10-08): source changes were committed/pushed; controller registration
was deployed and verified; DNS and the dedicated connector were created; signed GitHub ping
returned 200; staging build/typecheck/native runtime and HTTP routes/assets passed.
The application has not been activated in Production. The newly created webhook is temporarily
inactive until initial Admin bootstrap is configured, so setup pushes cannot deploy a partial app.
Next: set `ADMIN_EMAIL`, activate the webhook, push a verification commit, then confirm migrations,
bootstrap, deploy history, Discord acceptance and public HTTPS revision/assets.
