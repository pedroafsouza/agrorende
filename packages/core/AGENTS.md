# packages/core

Core owns server-side business orchestration, sync handlers, jobs, storage seams, PDF seams, notifications, numbering and module services. It imports only `@agrorende/contracts`, `@agrorende/db`, `ioredis` and `jose`, with the path-scoped exceptions documented in `docs/ARCHITECTURE.md`.

Do not import MongoDB directly, do not use driver collection access, and do not import Next.js or React from this package.
