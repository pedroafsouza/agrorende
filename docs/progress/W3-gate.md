# W3-gate · Wave 3 gate: change requests T06–T09 and T20

Status: DONE_WITH_GAPS
Wave: W3 gate · Agent finished: 2026-10-09 01:50

## Done
The orchestrator fixed the remaining gate failures and applied the open W3 change requests between waves (DELIVERY-PLAN §2.2 step 4). Each change request now has a `Status` line and a `## Resolution` section in full prose.

### Gate failures
- The web typecheck error `src/features/ops/testing.tsx(29,17): error TS2742` is fixed. `renderWithProviders` now declares its return type, `RenderResult & { readonly client: QueryClient }`.
- The `@ts-ignore` and `@ts-expect-error` workarounds around the `.tsx` PDF imports in core are gone. `packages/core/tsconfig.json` now sets `"jsx": "react-jsx"`, and `react` is a core dependency taken from the workspace catalog. The core ESLint scoped allowance for `src/pdf/**` now lists both `@react-pdf/renderer` and `react`.
- Several failures that W3 agents reported had already been fixed in the committed W3 tree, so they needed no change:
  - the T09 lint errors about `import()` type annotations;
  - the `operatorStore.test.ts` error `Type '"NEW"' is not assignable`;
  - the mobile Jest `react-native/asset-registry` error in `test/ui/tenancy.test.tsx`.
- `WO_DECLINE_REASON_REQUIRED` is already defined. `packages/contracts/src/errors.ts` declares it as a client code with its `ERROR_META`, so nothing was added.
- `expo-haptics` is now mocked globally in `apps/mobile/test/ui/setup.ts`. Individual UI suites no longer need to mock it.
- The organisation write gate means route tests now reach `assertOrganizationWritable`. A new web Vitest setup file, `apps/web/test/setup.ts`, mocks `@agrorende/core/tenancy` as writable, because those tests run without MongoDB. `withApi.test.ts` still exercises the gate predicate.

### Change requests applied
- **T06-001, T07-001, T08-001 item 1.** The field-report, work-order and rental seams in `packages/core/src/seams.ts` now delegate to the real services, so `seams.ts` no longer imports `notImplemented`.
- **T06-002, T07-003, T08-001 item 6.** The mobile home `widgets.ts` re-exports `QuickReportCard`, `MyReportsCard`, `NextJobCard` and `RentalsTodayCard` from the feature folders. `DutyCard` and `SyncCard` still come from `./cards`.
- **T06-003.** A new barrel, `apps/mobile/src/sync/mutators/index.ts`, registers every finished mutator module, and the session bootstrap imports it at app start. The `fieldReports.ts` placeholder now aliases the real report mutators.
- **T07-002, T08-001 item 3.** The meter-jump confirmation fields are in the contracts:
  - `confirmMeterJump` on work-order completion;
  - `meterJumpConfirmed` on inspections.

  When the flag is set, core skips the jump guard and marks the activity with `meterJumpConfirmed: true` and `attention: true`. A rentals test covers the confirmed check-in.
- **T07-004, T08-001 item 2.** Core now compiles JSX, as described under *Gate failures*.
- **T08-001 item 4.** `renderRentalDocument` in `pdf/index.ts` delegates to `renderRentalPdf`.
- **T08-001 item 5.** The dead legacy worker files `apps/worker/src/processors.ts` and `apps/worker/src/queues.ts` were deleted rather than trimmed. The live worker path is `jobs/index.ts`, and nothing else imported either file.
- **T09-001, items 1 and 2.** `packages/contracts/src/dto/ops.ts` and `packages/contracts/src/dto/costs.ts` hold the Ops Center, attention and cost roll-up zod schemas, with tests. The core DTO files take their enums from these schemas.
- **T09-002.** `useRealtime.ts` adds `useRealtimeEvent` and `useRealtimeStatus` on the single admin socket. `MapView` forwards a `MapRef` and passes `onError`, `onLoad`, `onClick` and `interactiveLayerIds` through to the map.
- **T20-002.** `assertOrganizationWritable` delegates to `assertOrgWritable` and is exported as `@agrorende/core/tenancy`.
  - `withApi` enforces it for every mutating tenant request. Exempt paths are listed in `WRITABLE_WHEN_READ_ONLY`; they cover auth, exports, org, sync, media and the other read-only-safe paths.
  - The sync push was already gated by `orgPushBackoff`.
- **T20-003.** The admin shell's `OrgBanner` renders `TenancyOrgBanner` with the support WhatsApp number.
- **T20-004.** The Operations Center renders `GettingStartedPanel` above the map. It replaces T09's local onboarding card.
- **T20-005.** The mobile Today screen renders `OrgStatusBanner`, and each session refresh now stores the organisation from `/auth/me`.

### Change requests deferred
- **T20-001 → DEFERRED-T10.** Every OAuth route is still mapped to `auth.oauthUnavailableHandler`, so there is no provider flow to carry a sign-up intent.
- **T09-001 item 3 → T10.** The optional resolution fields on `rejected_mutations` are deferred.

## Tests
- `pnpm install --frozen-lockfile` → exit 0, "Already up to date". The lockfile gained three lines when `react` was added to `packages/core`.
- `pnpm check` → exit 0. Test counts:

  | Package | Tests passed |
  |---|---|
  | contracts | 270 |
  | core | 215 |
  | api-client | 29 |
  | design-tokens | 2 |
  | db | 2 |
  | i18n | 7 |
  | web | 117 |
  | worker | 30 |
  | realtime | 10 |
  | mobile (Jest) | 119 |

- `pnpm i18n:check` → exit 0, "i18n-check passed for pt-BR, en". It printed warnings only, for unused `pdf.*` keys.
- `pnpm --filter web build` → exit 0.
- `pnpm --filter mobile exec expo export --platform android` → exit 0. The `apps/mobile/dist` output was deleted afterwards.

## Assumptions
- The org write gate exempts the whole `/api/v1/org` prefix, because T20's own `/org/*` routes enforce the organisation status per action. Accepting terms, cancelling and reactivating must remain possible while the organisation is read-only.
- A confirmed rental meter jump is recorded on the existing `rental.checkedIn` activity, not as a separate `rental.meterJumpConfirmed` activity, which keeps one activity per check-in.
- The core DTO interfaces stay as readonly mirrors of the new contracts schemas. Inferred zod types are mutable, and switching the services to them would be a large, behaviour-neutral change.
- The `fuelLogs` mobile mutator is left out of the registration barrel, because it is still a later-task stub that throws.

## Gaps
- **Meter-jump confirmation in the field UI.** The mobile job completion and check-in screens do not yet offer a "confirm reading" action that sends `confirmMeterJump` or `meterJumpConfirmed`; only the server side and the contracts are in place. This is outside the gate's scope and goes to T10.
- **T09-002 migration.** The Ops Center still opens its own socket and uses its own `OpsMap`. The shared seams exist, and migrating it is a behaviour-neutral refactor for T10.
- **T20-001.** The OAuth sign-up intent waits for the OAuth provider flows, which are still unavailable. This goes to T10.
- **T09-001 item 3.** The resolution fields on `rejected_mutations` are not yet in `packages/db`. This goes to T10.
- **Work-order meter-jump test.** There is no dedicated test for `confirmMeterJump` on work-order completion; the rentals path has one. This goes to T10.
- **Unused admin i18n keys.** The `admin.orgStatus.*` keys may now be unused, since the shell renders T20's banner. This is warning-level only, and the keys belong to T11's i18n sweep.

## Error cases added
- None.

## Change requests
- T06-001 · Field report from damage seam (APPLIED)
- T06-002 · Home report widgets (APPLIED)
- T06-003 · Mutator registration at app start (APPLIED)
- T07-001 · Work-order seams (APPLIED)
- T07-002 · Meter-jump confirmation on completion (APPLIED, field UI is a T10 gap)
- T07-003 · Home next-job widget (APPLIED)
- T07-004 · JSX in core (APPLIED)
- T08-001 · Rental seams, JSX, meter jump, PDF index, worker placeholder, home widget (APPLIED)
- T09-001 · Shared ops and costs DTOs (APPLIED, item 3 DEFERRED-T10)
- T09-002 · Shared realtime subscription and map ref (APPLIED, Ops Center migration is a T10 gap)
- T20-001 · OAuth sign-up intent (DEFERRED-T10)
- T20-002 · Organisation write gate (APPLIED)
- T20-003 · Admin organisation banner (APPLIED)
- T20-004 · Getting started panel on the Operations Center (APPLIED)
- T20-005 · Mobile organisation-paused banner (APPLIED)

## Notes for the next wave
- **Read-only organisations.** Mutating web routes now fail with the organisation status error while the organisation is read-only. A new route that must stay writable belongs in `WRITABLE_WHEN_READ_ONLY` in `apps/web/src/server/withApi.ts`. Web route tests get a writable gate from `apps/web/test/setup.ts`.
- **Realtime in the web app.** Subscribe through `useRealtimeEvent(event, handler)` from `@/features/shell/useRealtime` instead of opening another socket. Read the connection through `useRealtimeStatus()`.
- **DTO schemas.** Use the schemas in `@agrorende/contracts/dto` (`OpsLiveDTOSchema`, `CostRollupDTOSchema` and the rest) when validating Ops, attention or cost payloads in integration tests.
- **JSX in core.** Core compiles JSX natively, so new PDF templates in `packages/core/src/pdf/**` need no type-check workarounds.
- **Mobile mutators.** A new mutator module must be added to `apps/mobile/src/sync/mutators/index.ts` so that it is registered at app start.
