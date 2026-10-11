# SUPPLIER-P1 · Provider network, phase 1 (issues #63–#66)

Status: DONE_WITH_GAPS
Wave: feature work outside the original waves · Agent finished: 2026-10-11 09:51

## Done

- **#63 Invite an external provider from a work order.** The work order detail page now has a
  "Quem vai atender? / Who will do it?" panel with three options:
  - **Minha equipe / My team** opens the existing assign or reassign dialog.
  - **Rede AgroRende / AgroRende network** is a disabled card with a "coming soon" badge. It
    explains that the directory arrives in phase 2.
  - **Convidar de fora / Invite from outside** opens a form. It needs the provider's name and
    a WhatsApp number or an email address (at least one), and takes an optional message.

  Creating an invite works like this:
  - The core generates a random 32-byte token (base64url, 43 characters) and stores only its
    SHA-256 hash.
  - The invite is scoped to that one work order and expires after 7 days.
  - The plain link is returned once. The share card offers copy, a `https://wa.me/<digits>?text=…`
    link and a `mailto:` link. There is no WhatsApp API.
  - Office users can reissue an invite (which kills the old link) and revoke it.
  - Only one active invite can exist per work order at a time.

  Invite statuses are `SENT`, `OPENED`, `ACCEPTED`, `DECLINED`, `COUNTERED`, `EXPIRED`,
  `REVOKED` and `COMPLETED`. `EXPIRED` is derived from `expiresAt` when an invite is read, and
  it is persisted the first time an expired link is used.

  Every step writes a `provider.*` entry to the work order activity, which the timeline already
  shows (the provider's name is used as the summary). An invite card on the work order page shows
  the status, contact, dates, message, decline reason, counter-proposal, completion note,
  agreement, payment confirmations and review, together with reissue and revoke actions.

  Paths:
  - `packages/core/src/modules/providers/service.ts`
  - `apps/web/src/features/providers/{index,InviteDialog,InviteCard,shared}.tsx`
  - `apps/web/src/app/api/v1/work-orders/[id]/provider-invites/**`
- **#64 Magic-link page.** The public page is `/p/[token]`. It sits outside the `(admin)`
  layout and is listed in `PUBLIC_PREFIXES` in `apps/web/src/proxy.ts`. Its API lives under
  `/api/v1/provider-links/[token]/**`.
  - The page shows only minimal data: the organisation name, work order number, title and
    description, priority, requested date, asset make, model and plate, and the site name with a
    Google Maps link built from its coordinates. No third-party contact data is shown (LGPD).
  - The provider can accept, decline (with an optional reason) or counter-propose a price in
    BRL (stored in cents) and/or a date. Once accepted, the provider can mark the job done with a
    note.
  - The first view marks the invite `OPENED`.
  - An invalid, expired or revoked link renders a recovery page that says to ask the company for
    a new invite. It is never a dead end.
  - Lookups validate the token format before touching the database, compare by hash and are
    rate-limited to 30 requests per minute per client IP.
  - After completion, a "Create your free provider profile (60 days free)" call to action links to
    `${SITE_URL}/prestadores?origem=convite`, which is a placeholder.
  - The page sets `robots: noindex` and `referrer: no-referrer`.

  Paths:
  - `packages/core/src/modules/providers/publicLink.ts`
  - `apps/web/src/app/p/[token]/page.tsx`
  - `apps/web/src/features/providers/ProviderLinkPage.tsx`
- **#65 Agreed value and off-platform payment.** The office sets the agreed value (in cents) and
  the expected method (`PIX`, `BOLETO`, `CASH`, `TRANSFER`, `OTHER`).
  - Accepting a counter-proposal copies its price into the agreed value.
  - Both sides can mark "paid outside the platform": the customer in the admin and the provider
    on the magic-link page. Each confirmation stores a timestamp and appears in the UI and the
    activity.
  - Payment needs an agreed value. The agreement is locked once either side has confirmed a
    payment.
  - AgroRende never processes money.
  - The work order PDF now has a "Provider" section with the provider name, status, agreed value,
    method and both confirmations. It is hidden when costs are hidden.

  Paths:
  - `packages/core/src/modules/workOrders/report.ts`
  - `packages/core/src/pdf/workOrderReport.tsx`
- **#66 Reviews.** Only a `COMPLETED` invite can be reviewed, and only once, by the customer
  organisation.
  - A review has an overall rating from 1 to 5, four criteria (punctuality, quality, price and
    communication, each from 1 to 5) and an optional comment.
  - The thread is fixed: review, then one provider reply (on the magic-link page), then one final
    customer reply, then closed. The customer has the last word.
  - Either side can report a review. Reporting sets `moderationStatus: "FLAGGED"` and records the
    reason and the reporting side. There is no moderation UI.

  Paths:
  - `apps/web/src/app/api/v1/work-orders/[id]/provider-reviews/**`
  - `apps/web/src/app/api/v1/provider-links/[token]/review-{reply,report}`
- **Data.**
  - New collections `provider_invites` and `provider_reviews`, with schemas, types and `ScopedDb`
    accessors.
  - Indexes: `tokenHash` unique, `organizationId + workOrderId + createdAt`, `inviteId` unique
    on reviews, and `organizationId + workOrderId` on reviews.
  - Migration `packages/db/migrations/0005-SUPPLIER-P1.ts`, registered in the runner.
  - Contracts: enums `ProviderInviteStatus`, `ProviderPaymentMethod`, `ProviderReviewThreadStatus`, `ProviderReviewParty` and
    `ProviderReviewModerationStatus`, plus `packages/contracts/src/dto/providers.ts` (input and DTO
    schemas, `buildWhatsAppUrl`, `buildMailtoUrl`, `whatsappDigits`).
- **Email.** No mail transport exists in the repository. Creating or reissuing an invite with an
  email address writes an outbox event `provider.inviteEmail`. The event has no rooms, and its
  payload carries no address, only the invite id. In development it also prints the link to
  stdout. The UI offers a `mailto:` link, so the office can send the email from its own client.

## Tests

- `pnpm check:only @agrorende/contracts @agrorende/db @agrorende/core web` → exit 0. Typecheck
  and lint are clean, and every package's tests pass:

  | Package | Test files | Tests |
  |---|---|---|
  | contracts | 12 | 273 |
  | db | 4 | 11 |
  | core | 52 | 652 |
  | web | 65 | 398 |

  The gate's own `i18n:check` also passed.
- `pnpm i18n:check` → `[devloop:ok] i18n-check passed for pt-BR, en`.
- New core tests in `packages/core/src/modules/providers/service.test.ts` (12) cover:
  - token hashing and the 7-day expiry
  - contact validation
  - refusing a second active invite
  - the FIELD role getting `FORBIDDEN` and another organisation getting `NOT_FOUND`
  - reissue and revoke
  - expiry
  - the full open → accept → agreement → complete → paid path
  - the agreement lock
  - decline
  - counter and accept-counter
  - invalid tokens and the rate limit
  - the review thread limits and reporting
- `packages/core/src/__tests__/tenancy.test.ts`: the 10 authenticated routes are added to the
  cross-organisation table (all answer 404). The 8 public magic-link routes are in the allowlist
  as token-keyed.
- New web route tests in `apps/web/src/features/providers/routes.test.ts` (6) cover:
  - office create
  - FIELD users being refused
  - the agreement PATCH
  - the public GET with the forwarded IP as the rate-limit key
  - a 410 `INVITE_EXPIRED` with its reason
  - the counter POST, including malformed JSON → 422

## Assumptions

- Agreement, payment and completion data live on the invite document, not on `work_orders`. This
  keeps the mobile-synced work order DTO and the sync protocol unchanged.
- Office roles (`ADMIN`, `MANAGER`, through `OFFICE_ROLES`) manage invites and reviews. There is
  no separate dispatcher role in the enum.
- The 7-day expiry applies while the provider has not answered. After acceptance, the link's
  validity extends to 90 days so the provider can complete, confirm payment and reply to a review.
- A counter-proposal must be accepted by the office (`accept-counter`) before the provider can
  complete the job.
- Public magic-link writes run without an organisation context, so they skip the
  organisation-suspension check.
- The CTA link and the "network" option are placeholders, as the issue allows.

## Gaps

- #67–#70 (provider profile, directory, provider dashboard, subscription billing and regional
  launch) are out of scope for phase 1.
- #64: provider completion does not move the work order to `COMPLETED`. The office still
  completes or verifies through the existing flow. Suggested owner: phase 2.
- #64: completion takes a note only, with no photos. The media upload flow is authenticated and
  device-bound, so reusing it from a public token page needs its own design. Suggested owner:
  phase 2.
- #63: there is no real email delivery. An outbox event is written and the office sends the email
  through `mailto:`. A worker consumer is needed once a mail transport exists.
- No push or in-app notifications are sent to the office when the provider acts. The work order
  activity is the only signal.
- The mobile app shows the new `provider.*` activity actions as raw keys, if it renders them at
  all. The mobile app was out of scope here.
- There is no moderation UI for reported reviews. They only get `moderationStatus: FLAGGED`.
- There is no Playwright e2e spec (`apps/web/e2e/providers.spec.ts`). Coverage is the core
  service tests, the tenancy table and the web route tests.
- During verification the shared dev server on :3000 answered 500 for every page, including
  `/login`. The cause was a Tailwind CSS parse error on a garbled `text-[var(--ar-…)]` candidate
  in `globals.css`, which is not present in any source file. The new pages could therefore not be
  smoke-tested in a browser. Restarting the dev server with a clean `.next` cache should clear it.

## Error cases added

No new error codes. Existing codes are reused with a `details.context` or `details.reason`. These
cases should be appended to `docs/ERRORS.md` by its owner:

- **EC-PRV-01 Invalid, expired or revoked link.** The public link is unknown, past `expiresAt` or
  revoked. The response is `INVITE_EXPIRED` (410) with `details.reason` set to `invalid`,
  `expired` or `revoked`. Recovery: a full-page recovery view that says to ask the company for a
  new invite, with a link home. Owner: SUPPLIER-P1.
- **EC-PRV-02 An active invite already exists.** The office invites again while an invite is
  still pending or accepted. The response is `INVALID_TRANSITION` with `context:
  activeInviteExists`. Recovery: the invite button is disabled with an explanation, and the
  office can reissue or revoke the current invite. Owner: SUPPLIER-P1.
- **EC-PRV-03 Too many link requests.** A client exceeds 30 requests per minute on magic-link
  endpoints. The response is `RATE_LIMITED`. Recovery: an inline alert with retry. Owner:
  SUPPLIER-P1.
- **EC-PRV-04 Invite action not allowed in the current state.** For example, accepting after a
  decline, or completing before acceptance. The response is `INVALID_TRANSITION` with contexts
  `inviteClosed`, `notPending`, `notAccepted`, `notEngaged` or `counterMissing`. Recovery: an
  inline alert, and the page refetches the current state. Owner: SUPPLIER-P1.
- **EC-PRV-05 Payment without an agreed value, or an agreement changed after payment.** The
  response is `INVALID_TRANSITION` with `agreementMissing` or `paymentConfirmed`. Recovery: the
  admin shows the agreement form first, and the agreement fields are locked once a payment is
  confirmed. Owner: SUPPLIER-P1.
- **EC-PRV-06 Review thread closed.** A second provider reply, a final reply without a provider
  reply, or any reply after the final one. The response is `INVALID_TRANSITION` with
  `reviewThreadClosed`, `providerReplyMissing` or `reviewExists`. Recovery: the controls are
  hidden and a "thread closed" note is shown. Owner: SUPPLIER-P1.
- **EC-PRV-07 Review before completion.** The response is `INVALID_TRANSITION` with
  `inviteNotCompleted`. Recovery: the review form only appears for completed invites. Owner:
  SUPPLIER-P1.
- **EC-PRV-08 Work order closed or cancelled.** An invite is made on a cancelled, completed or
  verified work order. The response is `WO_CANCELLED` or `INVALID_TRANSITION` with
  `workOrderClosed`. Recovery: the invite option shows "work order closed" and is disabled.
  Owner: SUPPLIER-P1.

## Change requests

- None. The foundation freeze was lifted for this feature, so contracts, db and core were edited
  directly.

## Notes for the next phase

- Routes (authenticated, office roles), all under `/api/v1/work-orders/[id]/`:
  - `GET` and `POST` `provider-invites`
  - `POST` `provider-invites/[inviteId]/reissue`
  - `POST` `provider-invites/[inviteId]/revoke`
  - `PATCH` `provider-invites/[inviteId]/agreement`
  - `POST` `provider-invites/[inviteId]/accept-counter`
  - `POST` `provider-invites/[inviteId]/paid`
  - `POST` `provider-invites/[inviteId]/review`
  - `POST` `provider-reviews/[reviewId]/reply`
  - `POST` `provider-reviews/[reviewId]/report`
- Routes (public, token-keyed), all under `/api/v1/provider-links/[token]`:
  - `GET` on the base path
  - `POST` `accept`, `decline`, `counter`, `complete`, `paid`, `review-reply` and `review-report`
- Page (public): `/p/[token]`.
- Translations: `apps/web/messages/{en,pt-BR}/providers.json` (new namespace), plus
  `jobs.activity.provider.*`, `jobs.report.*` and `jobs.enums.provider*`.
- Phase 2 can attach a provider profile to `provider_invites` by adding a `providerId`. Invites
  are already keyed by organisation and work order.
