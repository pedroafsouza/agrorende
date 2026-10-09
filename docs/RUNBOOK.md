# AgroRende operations runbook

This runbook is for the people who operate AgroRende in staging and production: rotating secrets,
connecting the real Google and Apple sign-in providers, restoring backups, helping with a phone that
stopped syncing, and reading logs. It does not describe how to build or deploy a release; that lives
in [`docs/RELEASING.md`](RELEASING.md), which also describes the environments and the VM topology.

Every step in this file is a **human** step. It acts on real infrastructure, real accounts or real
customer data, and must be done by an authorised operator. Agents never run these steps.

## 1. Where things run (Phase 1)

| Piece | Where |
|---|---|
| Web app and REST API (`web`) | Docker container on the São Paulo VM, behind Caddy at `https://${APP_HOST}` |
| Realtime (`realtime`) | Docker container on the same VM, behind Caddy at `https://${WS_HOST}` |
| Worker (`worker`) | Docker container on the same VM, no public port |
| Redis | Docker container on the VM, data in `/srv/agrorende/redis` |
| Media (photos, videos, PDFs) | Host folder `/srv/agrorende/media`, mounted into `web` and `worker` as `/data/media` |
| MongoDB, production | MongoDB Atlas M10 on AWS `sa-east-1`, continuous backup with 7 days of point-in-time restore |
| MongoDB, staging | `mongo:8` single-node replica set on the staging VM |
| Backups | The `backup` container: a nightly restic snapshot of the media folder (and, on staging, a `mongodump`) to an off-site repository; 30 daily and 12 monthly snapshots are kept |
| Compose files | `/srv/agrorende/infra/compose/app.yml` and `/srv/agrorende/infra/compose/vm.yml`, with `/srv/agrorende/.env` (mode 600) |

In the commands below, `dc` stands for:

```bash
cd /srv/agrorende
alias dc='docker compose --env-file .env -f infra/compose/app.yml -f infra/compose/vm.yml'
```

If `docs/RELEASING.md` gives a different path for the compose files, follow it; it is the source for
the deployed layout.

## 2. Environment variables

The full list, with local examples, is in `.env.example` and in `docs/ARCHITECTURE.md` §16. In
staging and production the values come from the GitHub Environment secrets and are written to
`/srv/agrorende/.env` by the deploy workflow; do not edit that file by hand except in an emergency,
and if you do, put the same change into the GitHub Environment straight away, or the next deploy
overwrites it.

The variables that matter most in operations:

| Variable | Production value or rule |
|---|---|
| `APP_ENV` | `production` (or `staging`). Seeding and resetting refuse to run when it is `production`. |
| `MONGODB_URI` · `MONGODB_DB` | Atlas `mongodb+srv://…` and `agrorende`. |
| `REDIS_URL` | `redis://redis:6379` inside the compose network. |
| `JWT_SECRET` | 64 random hex characters. Rotating it signs everyone out of the web; the apps refresh silently with their refresh token. |
| `AUTH_ENCRYPTION_KEY` | 64 hex characters. Encrypts stored Apple refresh tokens. **Never rotate it without a re-encryption step**, or Apple revocation on account deletion stops working. |
| `MEDIA_URL_SECRET` | 32 or more random bytes. See §7. |
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | From the Google Cloud web OAuth client (§3). |
| `GOOGLE_OIDC_ISSUER` | `https://accounts.google.com`. The local value `http://localhost:4003/google` points at the mock provider and must never reach staging or production. |
| `APPLE_SERVICES_ID` · `APPLE_BUNDLE_IDS` · `APPLE_TEAM_ID` · `APPLE_CLIENT_ID` · `APPLE_KEY_ID` · `APPLE_PRIVATE_KEY` | From the Apple Developer account (§4). The worker checks these at start-up, because it needs them to revoke Apple tokens when someone deletes their account. |
| `APPLE_OIDC_ISSUER` | `https://appleid.apple.com`. |
| `OAUTH_MOBILE_SCHEMES` | `agrorende,agrorende-dev,agrorende-preview`. |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated Google emails of AgroRende staff allowed into `/platform` (§5). |
| `PLATFORM_SUPPORT_WHATSAPP` · `EXPO_PUBLIC_SUPPORT_WHATSAPP` | The support WhatsApp number in E.164 format, shown to customers whose organization is blocked. |
| `TRIAL_DAYS` · `TERMS_VERSION` | Trial length for new sign-ups and the version of the terms they accept. |
| `APP_URL` · `SITE_URL` · `APP_HOST` · `WS_HOST` · `SITE_HOST` | Public URLs and host names. `APP_URL` is also the CSRF origin, so it must match the browser address exactly. |
| `REALTIME_CORS_ORIGINS` | The web origin, for example `https://app.agrorende.com.br`. |
| `EXPO_ACCESS_TOKEN` | Optional. Raises Expo push limits. |
| `SENTRY_DSN` | Error reporting for web, realtime and worker. |

## 3. Google sign-in (Google Cloud)

Do this once per environment before the first real customer signs in. Staging and production use
separate OAuth clients.

1. In the Google Cloud console, create (or choose) the AgroRende project.
2. **OAuth consent screen:** user type *External*; app name "AgroRende"; logo; the support email;
   the home page (`https://${SITE_HOST}`) and the privacy policy page of the public site; scopes
   `openid`, `email` and `profile` only. Publish the app so it leaves "Testing" mode; with only
   these basic scopes Google does not require a security review.
3. **Credentials → Create OAuth client ID → Web application.** Add these authorised redirect URIs
   (replace the host for staging):
   - `https://app.agrorende.com.br/api/v1/auth/oauth/google/callback` (customers, web and app)
   - `https://app.agrorende.com.br/api/v1/platform/auth/google/callback` (platform staff)
4. Put the client id and secret into the GitHub Environment as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_OIDC_ISSUER=https://accounts.google.com`.
5. Deploy (see `docs/RELEASING.md`), then sign in with a test Google account on `/login`. A Google
   account that has not been invited gets "This account isn't in a team yet" with the offer to
   create a company or enter an invite code; that is correct.

The mobile app uses the same web client through the browser flow, and comes back to the app through
the URL schemes in `OAUTH_MOBILE_SCHEMES`; no Android or iOS OAuth client is needed for Phase 1.

## 4. Sign in with Apple (Apple Developer)

1. In Certificates, Identifiers & Profiles, enable **Sign in with Apple** on the three app ids:
   `app.agrorende.field` (store), `app.agrorende.field.preview` (staging) and
   `app.agrorende.field.dev` (development). Make the store app id the primary one and group the
   other two with it.
2. Create a **Services ID** for the web, for example `app.agrorende.signin`. Enable Sign in with
   Apple on it, add the domain `app.agrorende.com.br` (and the staging domain) and these return URLs:
   - `https://app.agrorende.com.br/api/v1/auth/oauth/apple/callback`
   - the same path on the staging host.
3. Create a **key** with Sign in with Apple enabled, linked to the primary app id. Download the
   `.p8` file; Apple only lets you download it once. Store it in the password manager.
4. Set the GitHub Environment secrets: `APPLE_SERVICES_ID` (the Services ID), `APPLE_BUNDLE_IDS`
   (the three app ids, comma-separated), `APPLE_TEAM_ID`, `APPLE_CLIENT_ID` (the Services ID used
   for token requests), `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (the full contents of the `.p8`
   file, including the BEGIN and END lines). Set `APPLE_OIDC_ISSUER=https://appleid.apple.com`.
5. Deploy and check that the worker starts without the log line `worker.apple.disabled`. That line
   means one of the Apple values is missing, and account deletion cannot revoke Apple tokens.

Known limitation: an owner who **signs up** with Apple has no stored Apple refresh token until their
next Apple sign-in, so deleting that account before then cannot revoke the token at Apple. The user
can remove AgroRende from "Sign in with Apple" in their Apple ID settings.

## 5. Platform staff access

The platform console at `/platform` (all organizations, trials, suspensions, sign-in links for
locked-out administrators) is limited to the Google emails in `PLATFORM_ADMIN_EMAILS`.

- **Add a staff member:** add their Google Workspace email to `PLATFORM_ADMIN_EMAILS` in the GitHub
  Environment and redeploy. They sign in at `https://${APP_HOST}/platform/login` with Google.
- **Remove a staff member:** remove the email and redeploy. Existing platform sessions are
  rejected at the next request because the list is checked every time.
- Every platform action asks for a reason and is written to the platform audit log, which is
  visible on each organization's page.

## 6. Restarting and checking the VM

**Restart one service** (for example after an out-of-memory kill):

```bash
cd /srv/agrorende
dc restart web            # or realtime, worker
dc ps                     # every service should be "running (healthy)"
```

**Restart everything** (after a host reboot Docker starts the services on its own; use this only if
they did not come back):

```bash
cd /srv/agrorende
dc up -d --wait
```

Restarting `web` interrupts in-flight uploads; the phones resume them automatically. Restarting
`realtime` disconnects every live map and phone for a few seconds; they reconnect and catch up.
Restarting `worker` delays notifications and scheduled jobs but loses nothing: every job is
idempotent and the event outbox is re-dispatched at start-up.

**Health endpoints:**

| Endpoint | Expected | Checks |
|---|---|---|
| `https://${APP_HOST}/api/v1/health` | HTTP 200 | MongoDB reachable, Redis reachable, `MEDIA_ROOT` writable. Used by the uptime monitor. |
| `http://localhost:4001/health` on the VM (also `https://${WS_HOST}/health`) | HTTP 200 | Realtime process and Redis subscription. |
| `http://localhost:4002/health` on the VM | HTTP 200 | Worker process, MongoDB, Redis and `MEDIA_ROOT`. Not exposed publicly. |

## 7. Disk growth

The media folder is the only thing that grows quickly. The monitoring alert fires at **70 %** disk
use.

1. Check what is using space: `df -h /srv/agrorende` and `du -sh /srv/agrorende/*`.
2. Check that the worker's `media.cleanupPending` job is running (it removes abandoned uploads):
   `dc logs --since 24h worker | grep media.cleanupPending`.
3. Grow the volume online in the cloud provider's console (no downtime), then grow the file
   system: `sudo growpart /dev/<disk> <partition>` followed by `sudo resize2fs /dev/<partition>`
   (or `sudo xfs_growfs /srv` on XFS). Confirm with `df -h`.
4. If the disk is above 70 % again after one resize, or media passes 500 GB, it is time for the
   Phase 2 move to object storage (see `docs/ARCHITECTURE.md` §7 and `docs/RELEASING.md`).

## 8. Restoring media with restic

The backup container keeps the restic repository settings in `/srv/agrorende/.env`
(`RESTIC_REPOSITORY`, `RESTIC_PASSWORD` and the storage credentials). Run restic through the
container so you use the same settings:

```bash
cd /srv/agrorende
dc run --rm backup restic snapshots --tag media          # list snapshots
```

**Restore one file** (for example a photo a customer says is broken). Find its storage key in
MongoDB (`media` collection, field `storageKey`; thumbnails use `thumbnailKey`). Keys are
relative to the media folder and look like
`org/<organizationId>/media/<yyyy>/<mm>/<mediaId>.jpg`. Then:

```bash
dc run --rm -v /srv/agrorende/restore:/restore backup \
  restic restore latest --tag media --target /restore --include "/data/media/<storageKey>"
sudo cp -p /srv/agrorende/restore/data/media/<storageKey> /srv/agrorende/media/<storageKey>
sudo rm -rf /srv/agrorende/restore
```

Use a snapshot id instead of `latest` if the file was damaged before the last backup. No restart is
needed; the next request serves the restored file.

**Restore the whole media folder** (for example after losing the volume):

1. Stop the services that write media: `dc stop web worker`.
2. Restore into an empty folder next to the live one:
   `dc run --rm -v /srv/agrorende/restore:/restore backup restic restore latest --tag media --target /restore`.
3. Swap the folders: `sudo mv /srv/agrorende/media /srv/agrorende/media.broken` and
   `sudo mv /srv/agrorende/restore/data/media /srv/agrorende/media`. Keep the ownership the
   containers expect (`sudo chown -R <uid>:<gid> /srv/agrorende/media`, the same as the broken
   folder).
4. Start again: `dc up -d --wait web worker`, then check `/api/v1/health`.
5. Photos taken after the snapshot are lost from the server, but phones keep a copy of everything
   they have not confirmed as uploaded. Remove `media.broken` once you are satisfied.

Do a restore drill of one file every month.

## 9. Restoring the database

**Production (Atlas point-in-time restore).** Atlas keeps 7 days of continuous backup, daily
snapshots for 30 days and monthly snapshots for 12 months.

1. Decide the exact time to restore to (before the bad change), in UTC.
2. In Atlas, open the cluster → Backup → Restore → *Point in time*. **Restore into a new cluster**,
   never over the live one.
3. Inspect the restored data. If it is right, either copy the affected collections back
   (`mongodump --uri <restored> --db agrorende --collection <name>` then `mongorestore` into the
   live cluster), or point `MONGODB_URI` at the restored cluster and redeploy.
4. Phones re-pull after the restore: every device whose sync cursor is ahead of the restored data
   gets a full reset on its next sync, and anything still in their outbox is pushed again.

**Staging (`mongodump`).** The nightly dump is stored by restic with the tag `mongo`:

```bash
cd /srv/agrorende
dc run --rm -v /srv/agrorende/restore:/restore backup \
  restic restore latest --tag mongo --target /restore
dc exec -T mongo mongorestore --archive --gzip --drop < /srv/agrorende/restore/<dump file>
```

Staging never contains production data.

## 10. Rotating `MEDIA_URL_SECRET`

Photo and file URLs handed to browsers and phones are signed with `MEDIA_URL_SECRET` and live for at
most 60 minutes.

1. Generate a new value: `openssl rand -hex 32`.
2. Put it into the GitHub Environment secret `MEDIA_URL_SECRET` and redeploy (or, in an emergency,
   edit `/srv/agrorende/.env` and `dc up -d web worker`).
3. Effect: every signed URL issued before the change stops working at once. Screens that are open
   simply ask for fresh URLs the next time they load, and **every outstanding signed URL would
   have expired within 60 minutes anyway**. Nothing stored in the database needs to change.

Rotate it immediately if it may have leaked, and otherwise once a year.

## 11. Resetting a user's phone

Use this when a person's app is stuck, they got a new phone, or a phone was lost or stolen. Local
data is never wiped without the person's knowledge: the app keeps unsent work until it is delivered.

- **App is stuck or out of date:** ask the person to open *More → Sync center* and tap
  **Sync now**. If items stay red, ask them to tap **Send diagnostics** and look at the report on
  `/team/devices` (see §12). Changing a person's role also forces a full re-download of their data
  on every phone at the next sync.
- **New phone:** the person signs in on the new phone. If the old phone still has unsent work
  (`/team/devices` shows pending items), ask them to open the old phone on Wi-Fi and wait for Sync
  center to show nothing pending before they stop using it.
- **Lost or stolen phone:** on `/team/[id]`, choose **Deactivate**. That signs the person out of
  every device and revokes every token. The lost phone can only send evidence it had already
  captured for jobs assigned to the person, for 72 hours, and nothing else. Then **Reactivate**
  and send a **Create password link** (or **Set temporary password**) so the person can sign in on
  the new phone. See `docs/SUPPORT.md` for the help-desk script.

## 12. A device that stopped syncing (OFF-11)

The worker job `devices.staleSync` runs every 30 minutes. It raises an alert for any device whose
oldest unsent change is older than the organization's `staleSyncAlertHours` setting (24 hours by
default), or that has not synced while its user is on duty. The alert appears for administrators
in `/attention` as a **STALE_DEVICE** item, as a
`DEVICE_STALE_SYNC` notification to administrators and managers, and on `/team/devices` with the warning "Changes stuck on the
device".

Triage, in order:

1. **Look at `/team/devices`.** Note the last sync time, the pending count (changes and uploads),
   battery, app version and the warnings: "Battery saver may delay sync", "Device clock is wrong",
   "Notifications off".
2. **Is the person simply out of signal?** Field crews often are. If the last sync is recent
   relative to their last shift, wait for them to return to coverage.
3. **Ask for diagnostics.** The person taps **Send diagnostics** in the app's Sync center. The
   report appears under the device on `/team/devices` and as a new **DIAGNOSTIC** item in `/attention`. It contains
   the outbox summary, upload queue, last errors with their codes and request refs, the clock
   offset and the app version; it never contains passwords or photo contents.
4. **Read the last error code** and look it up in `docs/SUPPORT.md`. The most common causes are
   an outdated app (`APP_UPDATE_REQUIRED`: update from the store), a wrong clock (fix the date
   setting on the phone), an organization that is suspended (`ORG_SUSPENDED`: see §14), a
   deactivated user (`USER_DISABLED`) or a rejected change that needs the office to decide
   (a conflict item in `/attention`).
5. **Check the server side** for that device: `dc logs --since 24h web | grep <ref>` with the
   request ref from the diagnostics.
6. When the device syncs, the alert stops by itself. Close the `/attention` item with
   **Resolve** and a short note; the person sees that the office resolved it.

## 13. Logs

- All three services log JSON lines (pino) to stdout. Docker keeps them with the `json-file`
  driver and size rotation.
- Read them with `dc logs --since 1h --tail 500 web` (or `realtime`, `worker`, `caddy`). Add `-f`
  to follow.
- Every API error response carries a `ref` (request id), which the apps show to the user under
  "Details". Search for it with `dc logs --since 24h web | grep '"ref":"<ref>"'`.
- Logs never contain personal data: no names, emails, phone numbers, passwords, tokens or exact
  coordinates. Users appear as ids. Do not add such data when sharing log excerpts.
- Errors are also sent to Sentry when `SENTRY_DSN` is set, tagged with the environment and the
  release.

## 14. Organization lifecycle jobs

Two worker jobs run every night in each organization's own timezone:

| Job | Time | What it does |
|---|---|---|
| `orgs.lifecycle` | 03:10 | A TRIAL whose `trialEndsAt` has passed becomes PAST_DUE. A PAST_DUE organization older than 14 days becomes SUSPENDED. Each change is pushed live to open screens. |
| `orgs.purge` | 03:20 | A CANCELLED organization whose `purgeAfter` has passed (90 days after cancellation) is deleted completely, including its media folder, and the purge is written to the platform audit log. |

While an organization is SUSPENDED or CANCELLED, phones may keep sending field work for 7 days, so
nothing captured in the field is lost. After that, sending returns `ORG_SUSPENDED` and the work
stays on the phones until the organization is reactivated. Reading still works until the purge.

To change an organization's status, extend a trial or change its plan, use
`/platform/orgs/[id]`; every change requires a reason. The customer-facing steps are in
`docs/SUPPORT.md`.

A purge cannot be undone except through the Atlas restore in §9, which only reaches back 7 days for
point-in-time and 30 days for daily snapshots. Before day 90, a cancelled organization can be
reactivated from the platform console.
