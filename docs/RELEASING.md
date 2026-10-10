# Releasing AgroRende

This guide describes how a change travels from `main` to staging, production and the app stores,
how to roll back and how to restore data. It implements ARCHITECTURE §18 and the delivery goals of
PRD §13: every change to `main` reaches staging automatically after CI, production releases are
approved by a person, and mobile fixes without native changes ship over the air the same day.

Operations that are not part of a release (secret rotation, device resets, incident handling) live
in [`docs/RUNBOOK.md`](RUNBOOK.md). VM provisioning lives in
[`infra/vm/README.md`](../infra/vm/README.md); the Phase 2 resource list lives in
[`infra/aws/README.md`](../infra/aws/README.md).

## 1. Environments

| Environment | Where | Data | Server images | Mobile | How it gets there |
|---|---|---|---|---|---|
| `local` | Developer machine | Root `docker-compose.yml` (MongoDB, Redis, OIDC mock) and seed | `pnpm dev`, or the production-like containers of §8 | Dev client, variant `development` | `pnpm devloop` |
| `ci` | GitHub-hosted runner | Compose services and seed | Built and tested by `ci.yml`; images built by `release.yml` | Jest and `expo export` | Every pull request and push to `main` |
| `staging` | VM in São Paulo | `mongo:8` on the VM (profile `staging`), seed plus synthetic data, never a copy of production | `sha-<12>` images from `main` | `preview` builds, EAS channel `preview` | `release.yml` → `deploy.yml`, automatically |
| `production` | VM in São Paulo plus MongoDB Atlas M10 (`sa-east-1`) | Atlas with continuous backup and point-in-time recovery | `vX.Y.Z` images: the staged digests, promoted | Store builds, EAS channel `production` | `deploy.yml`, approved by a reviewer |

`APP_ENV` selects the environment (`local`, `ci`, `staging`, `production`); non-production
environments show a ribbon in the web header and on the mobile Home screen. `pnpm db:seed`,
`db:reset` and `storage:seed` refuse to run when `APP_ENV=production`.

The OIDC mock (navikt `mock-oauth2-server`, service `oidc-mock` on port 4003) exists only in the
root `docker-compose.yml` for local and end-to-end runs. It is not part of `infra/compose/app.yml`
or `vm.yml`, and `infra/scripts/validate-env.sh` rejects any staging or production environment
whose issuers or URLs point at it, at `localhost` or at `host.docker.internal`. Staging uses the
real Google and Apple providers with staging redirect URIs.

## 2. GitHub settings

Set these once, as a repository administrator:

- **Ruleset on `main`:** pull request required, required checks `ci / checks` and `ci / build`,
  linear history, no force push, no deletion.
- **Tag ruleset on `v*`:** only maintainers create tags; no deletion or update of existing tags.
- **Security:** secret scanning with push protection, Dependabot alerts, CodeQL (`codeql.yml`).
- **Actions:** workflow permissions "Read repository contents"; the workflows request what they
  need (`packages: write` only in `release.yml` on `main` and on tags).
- **Packages:** the GHCR packages `agrorende-web`, `agrorende-migrate`, `agrorende-realtime`,
  `agrorende-worker` and `agrorende-backup` are private and grant the repository write access.
- **Environment `staging`:** deployment branches and tags limited to `main` and `v*`; no reviewers.
- **Environment `production`:** required reviewers (at least one person other than the author),
  "Prevent self-review" on, deployment branches and tags limited to `v*` (and `main` so a
  maintainer can dispatch `deploy.yml` from it; the workflow still accepts only `vX.Y.Z` image
  tags).

### Secrets and variables by environment

Every name below is defined in both the `staging` and the `production` GitHub Environment, with
values for that environment. Secrets are masked in logs; variables are not secret. Nothing is baked
into an image: `deploy.yml` renders `/srv/agrorende/.env` (mode 600) from these values and
`infra/scripts/validate-env.sh` checks it before anything is copied to the VM.

| Name | Kind | Staging | Production | Used by |
|---|---|---|---|---|
| `DEPLOY_HOST`, `DEPLOY_USER` | secret | staging VM | production VM | `deploy.yml` (SSH) |
| `DEPLOY_SSH_KEY` | secret | private key of the `deploy` user | same | `deploy.yml` |
| `DEPLOY_KNOWN_HOSTS` | secret | `ssh-keyscan` line of the VM | same | `deploy.yml` (strict host key checking) |
| `GHCR_READ_USER` | variable | account that owns the read token | same | `deploy.yml` (`docker login ghcr.io`) |
| `GHCR_READ_TOKEN` | secret | token with `read:packages` only | same | `deploy.yml` |
| `MONGODB_URI` | secret | `mongodb://mongo:27017/?directConnection=true` | Atlas `mongodb+srv://…` (required) | web, realtime, worker, migrate |
| `MONGODB_DB` | variable | `agrorende` | `agrorende` (required) | same |
| `JWT_SECRET` | secret | 64 hex characters (`openssl rand -hex 32`) | different 64 hex characters | web, realtime |
| `AUTH_ENCRYPTION_KEY` | secret | 64 hex characters | different 64 hex characters | web, worker (Apple refresh tokens) |
| `MEDIA_URL_SECRET` | secret | 32+ random characters | different value | web (signed media URLs) |
| `GOOGLE_CLIENT_ID` | variable | staging web OAuth client | production web OAuth client | web |
| `GOOGLE_CLIENT_SECRET` | secret | staging client secret | production client secret | web |
| `GOOGLE_OIDC_ISSUER` | variable | `https://accounts.google.com` (default) | `https://accounts.google.com` (enforced) | web |
| `APPLE_SERVICES_ID`, `APPLE_CLIENT_ID` | variable | Services ID with staging return URLs | Services ID with production return URLs | web |
| `APPLE_BUNDLE_IDS` | variable | `app.agrorende.field.preview,…` | `app.agrorende.field` | web (mobile token audience) |
| `APPLE_TEAM_ID` | variable | Apple team | Apple team (required) | web, worker |
| `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | secret | Sign in with Apple key (`.p8` content) | same (required) | web, worker (`auth.appleRevoke`) |
| `APPLE_OIDC_ISSUER` | variable | `https://appleid.apple.com` (default) | `https://appleid.apple.com` (enforced) | web |
| `OAUTH_MOBILE_SCHEMES` | variable | `agrorende-preview` | `agrorende` | web (mobile redirect allowlist) |
| `PLATFORM_ADMIN_EMAILS` | variable | staff emails | first staff email | web platform console |
| `PLATFORM_SUPPORT_WHATSAPP` | variable | E.164 number | E.164 number | web, worker, mobile support link |
| `TRIAL_DAYS` | variable | `30` | `30` | web, worker |
| `TERMS_VERSION` | variable | `YYYY-MM-DD` | `YYYY-MM-DD` | web, worker |
| `SITE_HOST`, `APP_HOST`, `WS_HOST` | variable | `staging.agrorende.com.br`, `app.staging.…`, `ws.staging.…` | `agrorende.com.br`, `app.…`, `ws.…` | Caddy, `APP_URL`, `SITE_URL`, mobile URLs |
| `ACME_EMAIL` | variable | operations mailbox | same | Caddy (Let's Encrypt account) |
| `EXPO_ACCESS_TOKEN` | secret | optional, push notifications | Expo access token | worker (push) |
| `SENTRY_DSN` | secret | staging project DSN | production project DSN | web, realtime, worker |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` | secret | off-site repository and password | same (required) | backup |
| `RESTIC_AWS_ACCESS_KEY_ID`, `RESTIC_AWS_SECRET_ACCESS_KEY` | secret | backup bucket credentials | same | backup |
| `RESTIC_AWS_DEFAULT_REGION`, `BACKUP_HOUR` | variable | default `sa-east-1`, `3` | same | backup |
| `SMOKE_FIELD_EMAIL`, `SMOKE_FIELD_PASSWORD`, `SMOKE_OFFICE_EMAIL`, `SMOKE_OFFICE_PASSWORD` | secret | seeded staging users (required) | optional dedicated smoke organisation | `deploy.yml` smoke |
| `EXPO_TOKEN` | secret | Expo robot token | same | `mobile.yml` (EAS) |
| `EAS_UPDATE_URL` | variable | `https://u.expo.dev/<EAS project id>` | same | `mobile.yml` (`app.config.ts` `updates.url`) |
| `EAS_PROJECT_ID` | variable | EAS project id | same | `mobile.yml` (`extra.eas.projectId`, change request T18-004) |
| `EXPO_PUBLIC_SENTRY_DSN` | variable | mobile staging DSN | mobile production DSN | `mobile.yml` |

`deploy.yml` also writes `APP_ENV`, `IMAGE_REGISTRY` (`ghcr.io/<owner>`), `IMAGE_TAG`,
`MEDIA_DRIVER=local`, `APP_URL=https://APP_HOST`, `SITE_URL=https://SITE_HOST`, and on staging
`COMPOSE_PROFILES=staging` and `BACKUP_MONGO_URI`. The map style URLs (`NEXT_PUBLIC_MAP_STYLE_URL`,
`NEXT_PUBLIC_MAP_STYLE_DARK_URL`) are build arguments of the web image with the OpenFreeMap
defaults.

`validate-env.sh` fails the deploy when: a required name is empty; `APP_ENV` does not match the
target; `GOOGLE_OIDC_ISSUER` is not `https://accounts.google.com` or `APPLE_OIDC_ISSUER` is not
`https://appleid.apple.com`; any value contains `localhost`, `127.0.0.1`, `host.docker.internal`,
`oidc-mock`, `mock-oauth2` or `:4003`; `JWT_SECRET` or `AUTH_ENCRYPTION_KEY` is not 64 hex
characters or is all zeros; `MEDIA_URL_SECRET` is shorter than 32 characters or all zeros; the
Google client is the local mock client; `APP_URL` is not HTTPS; and in production when
`MONGODB_URI` is not `mongodb+srv://`, `MONGODB_DB` is not `agrorende`, or the Apple keys or the
restic settings are missing.

### Human steps before the first production release

These come from ARCHITECTURE §18.4 and are done once by a person:

1. Google Cloud: create the OAuth consent screen (External; app name, logo, support email, privacy
   policy and home page; scopes `openid email profile`; publish it). Create one web OAuth client
   per environment with the callback URIs `https://APP_HOST/api/v1/auth/oauth/google/callback`
   (sign-in) and `https://APP_HOST/api/v1/platform/auth/google/callback` (platform console) of that
   environment.
2. Apple: enable Sign in with Apple on the three bundle ids, create the Services ID and the return
   URLs `https://APP_HOST/api/v1/auth/oauth/apple/callback` per environment, and create the key; store
   the `.p8` content in `APPLE_PRIVATE_KEY` and its id in `APPLE_KEY_ID`.
3. Expo: create the EAS project, a robot access token (`EXPO_TOKEN`) and set `EAS_UPDATE_URL`;
   configure the EAS environment variables `preview` and `production` with the same
   `EXPO_PUBLIC_*` values as `mobile.yml`, because cloud builds read them from EAS.
4. MongoDB Atlas: project, M10 cluster in AWS `sa-east-1`, database user limited to `agrorende`,
   network access for the production VM address, Cloud Backup with continuous backup (7 days of
   point-in-time recovery, daily snapshots for 30 days, monthly snapshots for 12 months).
5. Provision both VMs (`infra/vm/README.md`), point DNS, and initialise the restic repositories.
6. Put the first staff email in `PLATFORM_ADMIN_EMAILS`.

## 3. Versioning

- Server releases are Git tags `vX.Y.Z` on a commit of `main`. Increase the minor version for new
  features, the patch version for fixes, and the major version for breaking changes to the sync
  protocol (which is also versioned by path, `/api/v1`).
- Every image built on `main` is tagged `sha-<first 12 characters of the commit>`. A release tag
  re-tags the **exact staged digests** as `vX.Y.Z`; tags never rebuild.
- The images are `ghcr.io/<owner>/agrorende-web`, `agrorende-migrate`, `agrorende-realtime`,
  `agrorende-worker` and `agrorende-backup`.
- Mobile uses the Expo `version` in `apps/mobile/app.config.ts` and
  `runtimeVersion: { policy: "fingerprint" }` (§6).

## 4. Release flow

### 4.1 Pull requests

`release.yml` builds all five images and the site artifact (`site.tar.gz`, an archive of
`apps/landing/out`) with no registry login and no push, so a broken Dockerfile fails the pull request.
`ci.yml` runs the checks, including the site's Playwright checks and Lighthouse budgets.

### 4.2 Merge to `main` → staging

1. `release.yml` builds and pushes the five `sha-<12>` images with provenance and an SBOM, and
   attests them. The digests appear in the job summary.
2. It calls `deploy.yml` with `environment: staging` and `image_tag: sha-<12>`.
3. `deploy.yml` deploys (§5) and runs `pnpm smoke` against staging.

### 4.3 Cut a production release

1. Pick a commit of `main` whose staging deploy succeeded and was checked by a person.
2. Tag it and push the tag:

   ```bash
   git tag -a v1.2.0 <commit> -m "v1.2.0"
   git push origin v1.2.0
   ```

3. `release.yml` (job `promote`) checks that the tag is `vX.Y.Z`, that the commit is on `main` and
   that a staging deployment of that commit succeeded; then it re-tags each `sha-<12>` digest as
   `v1.2.0` with `docker buildx imagetools create`, checks the digests match, and creates the
   GitHub Release with the digests in the notes.
4. Run **Actions → deploy → Run workflow** with `environment: production` and `image_tag: v1.2.0`.
   The `guard` job refuses anything but a `vX.Y.Z` tag whose images equal the staged digests and
   whose commit has a successful staging deployment. A reviewer approves the `production`
   environment, then the deploy runs.
5. The same tag starts `mobile.yml` for the production profile (§6), which also waits for the
   `production` environment approval.
6. The same tag also starts `android-apk.yml`, which attaches an unsigned Android APK to the
   release (§6.1).

## 5. SSH deploy flow (Phase 1)

`deploy.yml` runs on a GitHub-hosted runner and connects only to the VM of the selected
environment:

1. **Guard:** resolve `image_tag` to a commit on `main`; production checks of §4.3.
2. **Checkout** of that commit, so the compose files and the Caddyfile always match the images (a
   rollback rolls them back too).
3. **Render** the `.env` from the environment's secrets and variables with
   `infra/scripts/render-env.py` and **validate** it with `infra/scripts/validate-env.sh`.
4. **Copy** `app.yml`, `vm.yml` and the `Caddyfile` to `/srv/agrorende`, the `.env` (mode 600)
   through SSH standard input, and the static site (`apps/landing/out/`, with `rsync --delete`) to
   `/srv/agrorende/site`. The site is built on the runner for the target environment, so
   canonical, hreflang and sitemap URLs use that environment's `SITE_HOST`. The optional
   variables `SITE_SHOW_PRICES`, `SITE_WHATSAPP`, `SITE_CONTACT_EMAIL`, `SITE_PRIVACY_EMAIL`,
   `SITE_APP_STORE_URL` and `SITE_PLAY_STORE_URL` tune the build; see `docs/LANDING.md`.
5. **Pull:** `docker login ghcr.io` with `GHCR_READ_TOKEN` (read-only), then
   `docker compose -f app.yml -f vm.yml --profile migrate pull`.
6. **Migrate:** start Redis (and MongoDB on staging), then
   `docker compose -f app.yml -f vm.yml run --rm migrate` (§7).
7. **Roll** `worker` and `realtime`, then `web`, each with `up -d --wait --no-deps`, which waits
   for the container health checks; then `caddy` and `backup`, and reload Caddy.
8. **Check** `https://APP_HOST/api/v1/health` and `https://WS_HOST/health` from the runner, then
   run `pnpm smoke --base-url https://APP_HOST --ws-url https://WS_HOST`. Staging always runs the
   smoke with the `SMOKE_*` users; production runs it only when a dedicated smoke account is
   configured, because the smoke writes a field report and an export.
9. **Clean up:** `docker logout ghcr.io` and `docker image prune -f` on the VM; the runner deletes
   the key and the rendered `.env`.

A web restart takes a few seconds; that downtime is accepted in Phase 1. Deploys of one
environment never overlap (`concurrency: deploy-<environment>`).

## 6. Mobile: over-the-air update or store build

`mobile.yml` runs on `vX.Y.Z` tags (profile `production`, both platforms) and on demand with the
inputs `profile` (`preview` or `production`) and `platform` (`android`, `ios` or `all`). For each
platform it:

1. resolves the runtime version, which is the Expo fingerprint of the native project
   (`npx expo-updates runtimeversion:resolve --platform <platform>`);
2. looks for a finished EAS build of the same profile with that runtime version
   (`eas build:list --runtime-version …`);
3. if one exists, the native side did not change: it publishes the JavaScript with
   `eas update --channel <profile>`, which reaches installed apps on their next start;
4. if none exists, the native side changed: it starts EAS cloud builds with
   `eas build --non-interactive --no-wait`, and for production adds `--auto-submit`, so the store
   submission (`eas submit`) runs when the build finishes. The build links are in the job summary
   and the JSON results are uploaded as workflow artifacts.

All EAS steps need the `EXPO_TOKEN` secret and fail early without it. Pull requests with the
`mobile-preview` label get an update on the EAS branch `pr-<number>` and a QR code comment.

Mobile rollback: republish the previous update group with
`eas update:republish --group <previous group id>` (the group ids are in the `mobile.yml` job
summary and in the EAS dashboard). A store build cannot be rolled back; ship a fix forward.

### 6.1 Android APK (unsigned)

`android-apk.yml` attaches an unsigned Android APK of the production variant to every GitHub
Release, for testers and for side-loading outside the stores. It does not replace the EAS store
builds of §6 and needs no Expo account or `EXPO_TOKEN`.

- **Trigger:** the same `vX.Y.Z` tag push that starts `release.yml`. The job builds on the runner
  (`expo prebuild --platform android --clean`, then `./gradlew assembleRelease`), waits up to 30
  minutes for `release.yml` to create the release, and uploads
  `agrorende-vX.Y.Z-unsigned.apk` and `agrorende-vX.Y.Z-unsigned.apk.sha256` with
  `gh release upload --clobber`. The files are also kept as a workflow artifact for 30 days.
- **Manual run:** **Actions → android-apk → Run workflow** with `tag` (an existing `vX.Y.Z`
  release: rebuild and replace its APK) and `variant` (`production` or `preview`). With `tag`
  empty, the selected branch is built and the APK is only a workflow artifact
  (`agrorende-<sha>[-preview]-unsigned.apk`).
- **Configuration:** the job runs without a GitHub Environment, so it reads only
  repository-level variables and secrets. `APP_HOST`, `WS_HOST` and `SITE_HOST` default to the
  production hosts (`app.agrorende.com.br`, `ws.agrorende.com.br`, `agrorende.com.br`; staging
  hosts for `preview`). `PLATFORM_SUPPORT_WHATSAPP`, `EXPO_PUBLIC_SENTRY_DSN`, `EAS_UPDATE_URL`,
  `EAS_PROJECT_ID` and the secret `GOOGLE_MAPS_ANDROID_API_KEY` are optional; without the
  Maps key the map screens show no tiles. `ANDROID_APK_ARCHS` (default
  `armeabi-v7a,arm64-v8a`) chooses the ABIs. The Sentry source map upload and the
  `lintVitalRelease` task are skipped.
- **Version:** the APK carries the `version` of `apps/mobile/app.config.ts` and `versionCode` 1;
  the file name carries the tag.

**Why unsigned:** the workflow removes the debug key from the release build type, so no key ever
lives in CI and nobody installs an APK signed with the public debug key. Android refuses to
install an unsigned APK ("App not installed" / `INSTALL_PARSE_FAILED_NO_CERTIFICATES`). Sign it
with your own key first, using the Android SDK build tools:

```bash
# Once: create a keystore (keep it out of the repository).
keytool -genkeypair -v -keystore agrorende-sideload.jks -alias agrorende \
  -keyalg RSA -keysize 4096 -validity 10000

sha256sum -c agrorende-v1.2.0-unsigned.apk.sha256
zipalign -p -f 4 agrorende-v1.2.0-unsigned.apk agrorende-v1.2.0-aligned.apk
apksigner sign --ks agrorende-sideload.jks --ks-key-alias agrorende \
  --out agrorende-v1.2.0.apk agrorende-v1.2.0-aligned.apk
apksigner verify --print-certs agrorende-v1.2.0.apk
adb install agrorende-v1.2.0.apk
```

`zipalign` and `apksigner` live in `$ANDROID_HOME/build-tools/<version>/`. An app signed with one
key cannot be updated in place by the same package signed with another key (including the Play
Store build); uninstall first.

## 7. MongoDB migrations and indexes

The `migrate` image runs `packages/db/migrations/runner.ts`, the same code as `pnpm db:migrate`:
it applies `ensureIndexes()` (through the first migration) and every pending data migration in
order, then exits. Run it locally with `pnpm db:migrate`, and on a VM with
`docker compose -f app.yml -f vm.yml run --rm migrate`.

Migrations are backwards compatible with the previous release, so there are no down-migrations.
Breaking schema changes take two releases: **expand** (add the new field or index and write both
shapes) → **migrate** (backfill in a data migration) → **contract** (stop reading the old shape in
the next release, then remove it).

## 8. Local checks (no remote access)

Everything that does not need a registry, a VM or EAS can be run on a developer machine. These are
the commands T18 ran; the results are in `docs/progress/T18.md`.

```bash
# Images (legacy builder and BuildKit both work).
docker build -f apps/web/Dockerfile --target runner -t agrorende-web:local .
docker build -f apps/web/Dockerfile --target migrate -t agrorende-migrate:local .
docker build -f apps/realtime/Dockerfile -t agrorende-realtime:local .
docker build -f apps/worker/Dockerfile -t agrorende-worker:local .
docker build -f infra/backup/Dockerfile -t agrorende-backup:local infra/backup

# Production-like containers on the T18 check ports, against the root compose MongoDB and Redis.
MONGODB_DB=agrorende_t18 MEDIA_ROOT=./.data/media-t18 pnpm db:reset
MONGODB_DB=agrorende_t18 MEDIA_ROOT=./.data/media-t18 pnpm storage:init
MONGODB_DB=agrorende_t18 MEDIA_ROOT=./.data/media-t18 pnpm storage:seed
WEB_PORT=3200 REALTIME_PORT=4201 WORKER_PORT=4202 MONGODB_DB=agrorende_t18 \
  MEDIA_ROOT_HOST=./.data/media-t18 \
  docker compose -f docker-compose.yml -f infra/compose/app.yml up -d --build --wait web realtime worker
pnpm smoke --base-url http://localhost:3200 --ws-url http://localhost:4201 --worker-url http://localhost:4202
docker compose -f docker-compose.yml -f infra/compose/app.yml run --rm --no-deps migrate
docker compose -f docker-compose.yml -f infra/compose/app.yml rm --stop --force web realtime worker

# Configuration checks.
docker compose -f infra/compose/app.yml -f infra/compose/vm.yml config --quiet
COMPOSE_PROFILES=staging docker compose -f infra/compose/app.yml -f infra/compose/vm.yml config --quiet
docker run --rm -v "$PWD/infra/caddy:/etc/caddy:ro" --entrypoint caddy caddy:2 \
  validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:latest
bash infra/scripts/validate-env.sh production <rendered env file>   # needs bash 4 or newer
```

If the developer `.env` points `MONGODB_URI` or `REDIS_URL` at `localhost`, set
`APP_MONGODB_URI="mongodb://host.docker.internal:27017/?directConnection=true"` and
`APP_REDIS_URL=redis://host.docker.internal:6379` for the container run, or let the root compose
services `mongo` and `redis` serve them (the defaults). Containers ignore the developer `.env`
addresses because `app.yml` sets container addresses explicitly.

Remote steps are never run from a developer machine or by an agent: pushing images, SSH to a VM,
`deploy.yml`, EAS builds, updates and submissions.

## 9. Rollback

### Server

Redeploy the previous release tag: **Actions → deploy → Run workflow** with the environment and
`image_tag` set to the previous `vX.Y.Z` (or, on staging, the previous `sha-<12>`). The deploy
checks out the matching commit, so the compose files and Caddyfile roll back as well. Migrations
are backwards compatible with the previous release, so the database is not rolled back.

When GitHub Actions is unavailable, an operator with VM access can do the same by hand:

```bash
cd /srv/agrorende
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG='"'"'v1.1.0'"'"'/' .env
docker compose -f app.yml -f vm.yml pull web realtime worker
docker compose -f app.yml -f vm.yml up -d --wait --no-deps worker realtime
docker compose -f app.yml -f vm.yml up -d --wait --no-deps web
```

Record a manual rollback in `docs/RUNBOOK.md` and re-run `deploy.yml` with the same tag once
Actions is back, so the VM files match a known commit again.

### Mobile

`eas update:republish --group <previous group id>` (§6).

## 10. Restores

### Media (staging and production)

Media snapshots are in the restic repository of each environment. Restores go to
`/srv/agrorende/restore`, never in place:

```bash
cd /srv/agrorende
docker compose -f app.yml -f vm.yml run --rm backup snapshots
docker compose -f app.yml -f vm.yml run --rm backup restore latest /data/media/<media key>
# check the file, then copy it back with the uid 1000 owner:
sudo install -o 1000 -g 1000 -m 640 restore/data/media/<media key> media/<media key>
```

Use a snapshot id instead of `latest` to go back further (30 daily and 12 monthly snapshots are
kept).

### Staging database (restic + mongodump)

```bash
docker compose -f app.yml -f vm.yml run --rm -T backup restore-mongo latest \
  | docker compose -f app.yml -f vm.yml exec -T mongo \
      mongorestore --archive --gzip --drop --nsFrom 'agrorende.*' --nsTo 'agrorende.*'
```

Drill first into a scratch database (`--nsTo 'agrorende_restore.*'`, see `infra/vm/README.md`).

### Production database (Atlas)

Production data is restored with Atlas, not restic:

1. **Point-in-time recovery** (last 7 days): Atlas → cluster → Backup → Restore → "Point in Time",
   target a **new** cluster (never the live one), check it, then switch `MONGODB_URI` in the
   `production` environment and redeploy the current tag.
2. **Snapshot restore** (daily for 30 days, monthly for 12 months): the same flow with a snapshot.
3. **Single collection or organisation:** restore to a new cluster, then
   `mongodump --uri <restored cluster> --db agrorende --collection <name> --archive --gzip` and
   `mongorestore --uri <production> --archive --gzip --nsInclude 'agrorende.<name>'` from an
   operator machine allowed in the Atlas network access list, after taking a fresh snapshot.

The monthly restore drill (PRD §13) restores one media file and the staging database as in
`infra/vm/README.md`, and an Atlas snapshot into a temporary cluster; record each drill in
`docs/RUNBOOK.md`.
