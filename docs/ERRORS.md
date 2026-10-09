# AgroRende — Error catalog

> The source of truth for recoverable user-facing errors, localized copy, recovery actions and implementation tests.

| Field | Value |
|---|---|
| Status | v1.2, ready for build |
| Date | 2026-10-08 |
| Doc set | Round 5 (2026-10) |
| EC entries | 198 |
| Code counts | 78 server / 110 client / 188 total |
| Companion docs | `docs/PRD.md` §12.2; `docs/ARCHITECTURE.md` §21; `docs/DELIVERY-PLAN.md`; `docs/TASKS.md` |
| Audience | Agents implementing screens, API routes and tests; office support |

### Changelog

- **v1.2.1 (2026-10-09):** T10 merged the error cases proposed in the W2/W3 progress files (T02, T05, T07, T08) into the existing entries EC-PLT-31, EC-PLT-42, EC-SYN-22, EC-SYN-28, EC-WO-14 and EC-RN-13; `WO_DECLINE_REASON_REQUIRED` was already catalogued as EC-WO-02. None needed a new user-facing code, so the entry and code counts are unchanged. `APPLE_REVOKE_FAILED` is recorded as an internal job failure reason, not as a catalogued code.
- **v1.2 (2026-10-08):** MongoDB 8 replaces PostgreSQL/Prisma for the MVP; pnpm workspaces replace Turborepo; visual direction and single palette; review fixes (round 5).
- **v1.1 (2026-10-08):** Round 4: multi-tenant SaaS (self-service sign-up, trial, subscription status, platform console), sign-in with Google, Apple or invite + password, three roles (ADMIN, MANAGER, FIELD).
- **v1.0 (2026-10-08):** consolidated the five draft catalogs, applied the final gap decisions, deduplicated cross-area cases and produced the build-ready code index.

## 1. How to use this catalog

Every error is a detour, never a dead end. The user always sees what happened, knows their data is safe, and has one obvious next step they can take alone, offline, in under 30 seconds. Calling the office is a fallback offered next to that step, never the only way out. The first activation/sign-in is the one explicit exception to the offline/30-second rule because the device has no local data or credentials yet.

- Every user-visible error has one EC entry and one code.
- User copy lives in the i18n `errors` namespace as `errors.<CODE>.title`, `errors.<CODE>.body`, `errors.<CODE>.action` and optional `errors.<CODE>.help`.
- The pt-BR and English copy in each EC entry is the source for the first two locale files. pt-BR is the reference copy.
- Adding a new error means adding the code to `contracts/errors.ts`, adding `ERROR_META`, adding i18n keys, adding an EC entry here and adding a test.
- T10 checks the catalog code index against `ERROR_META` and required i18n keys.
- Help links use `helpUrl(code, locale)`: `/pt-br/ajuda/erros/<code-kebab>` and `/en/help/errors/<code-kebab>`.

## 2. Recovery patterns

| Code | Meaning | Typical UI |
|---|---|---|
| `AUTO` | Automatic retry — The app retries safely with backoff and visible status. | badge, queue row, Sync Center card |
| `RETRY` | Retry button — The user explicitly tries again; requests are idempotent. | Try again button on banner, sheet or row |
| `FIX` | Fix in place — Highlight the field or step, keep the input and show a valid example. | inline error, form summary, focused wizard step |
| `ALT` | Alternative path — Offer another way to finish the same goal. | sheet actions such as Type code, Pick site, Choose from gallery |
| `DRAFT` | Keep as draft — Save and resume at the same step later. | wizard draft, form guard, Continue draft action |
| `UNDO` | Undo — Allow a 10 s undo for destructive local actions. | toast and Recently deleted for drafts |
| `RESTORE` | Restore — Bring back archived office records where allowed. | restore action/page |
| `SETTINGS` | Open settings — Deep-link to OS/app settings, then Check again. | permission, battery, storage, clock or browser setting |
| `REAUTH` | Sign in again in place — Re-login without leaving the current screen or losing form state. | modal/dialog over current screen |
| `UPDATE` | Update the app — Open store/update path while keeping local data. | full screen or browser update page |
| `OFFICE` | Ask the office — Call or WhatsApp the configured office number with context. | secondary sheet action or job/rental action |
| `DIAG` | Send diagnostics — Queue redacted diagnostics offline and show them to the office. | Settings → Help or error sheet action |
| `HANDOFF` | The office will fix it — Create/route an attention item; user keeps working. | Needs attention queue plus field confirmation |
| `FALLBACK` | Graceful degradation — Show last known data or explain when the feature returns. | banner, stale timestamp, empty state |

## 3. Message anatomy and surfaces

- **Anatomy:** title, body, primary action, optional secondary action and copyable reference for server errors.
- **Copy rules:** title up to 60 characters; body up to two short sentences; no blame, no jargon, no HTTP numbers, no lone OK, no cleared input.
- **Surfaces:** inline for field validation; banner for degraded non-blocking states; sheet/dialog for user decisions; full screen only for blocking states; toast only for success, information and Undo.
- **References:** server errors show a small copyable `Ref XXXX-XXXX`; client-only errors do not invent refs.
- **Context variants:** `errors.<CODE>.title|body|action` is the default copy. A call site may pass `context` and use `errors.<CODE>.<context>.title|body|action` when present (for example `RATE_LIMITED.login`, `RESET_REQUIRED.sync`, `TOKEN_EXPIRED.webEdit`, `VALIDATION_FAILED.import`, `VALIDATION_FAILED.mutationIdReuse`, `RENTAL_SIGNER_UNAVAILABLE.checkout` / `.checkin`). `ERROR_META` keeps one row per code with optional `contexts: string[]`; variants never create new codes.

Worked example:

| Locale | Title | Body | Primary action | Secondary |
|---|---|---|---|---|
| pt-BR | Nenhum app de mapas encontrado | A OS está salva. Copie as coordenadas ou abra no navegador. | Copiar coordenadas | Abrir no navegador |
| en | No maps app found | The job is saved. Copy the coordinates or open them in the browser. | Copy coordinates | Open in browser |

## 4. Platform and device (EC-PLT)

#### EC-PLT-01 · First sign-in needs internet
- **When:** a field user opens the app for the first time with any sign-in method, including Google or Apple, or after reinstalling, with no usable connection.
- **Detected by:** `FIRST_LOGIN_ONLINE_REQUIRED` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Entre uma vez com internet" / "Depois de baixar os dados pela primeira vez, o AgroRende abre sem sinal. Nada foi perdido." en: "Sign in once with internet" / "After the first data download, AgroRende opens with no signal. Nothing was lost."
- **Recovery:** `SETTINGS` (Open Wi-Fi/mobile data settings, Check again), `OFFICE`.
- **Data safety:** no local work exists yet; credentials are not saved until sign-in succeeds. This first activation is the catalog's only explicit exception to the offline and under-30-second recovery rule.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T03 · refs PLT-01, OFF-01, A§7.9, A§13.1.
- **Test:** component test: first launch + offline NetInfo → full screen with settings action, safe-data copy and the explicit first-activation exception note.

#### EC-PLT-02 · Email or password not accepted
- **When:** sign-in returns the generic invalid-credentials response for the typed email and password.
- **Detected by:** `INVALID_CREDENTIALS` (server, new, HTTP 401) — runtime check for this case.
- **User sees:** inline. pt-BR: "E-mail ou senha não conferem" / "Confira os dados e tente de novo. Seus rascunhos deste aparelho continuam salvos." en: "Email or password did not match" / "Check the details and try again. Your drafts on this device stay saved."
- **Recovery:** `FIX` (focus password, Show password, Try again), `OFFICE`.
- **Data safety:** pending data for any signed-in user remains in that user's local database.
- **Office sees:** rate-limit and auth logs with the request ref, never whether the e-mail exists or the password value.
- **Priority / owner:** P0 · T03 · refs PLT-01, A§7.9, A§11.
- **Test:** route/component test: `INVALID_CREDENTIALS` keeps typed email, clears only password, follows Architecture §21.5 recovery (`FIX`, `OFFICE`) and reveals no account-existence detail.

#### EC-PLT-03 · Account disabled
- **When:** a disabled user signs in with password, Google or Apple, refreshes, or opens the app with pending items on this phone.
- **Detected by:** `ACCOUNT_DISABLED` (server, new, HTTP 403) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Seu acesso foi desativado" / "Seus itens continuam salvos. Veja o que está pendente ou envie um diagnóstico." en: "Your access was turned off" / "Your items are still saved. See what is pending or send diagnostics."
- **Recovery:** `FALLBACK` (Ver itens pendentes, offline and read-only; Salvar cópia), `DIAG` (Enviar diagnóstico), `OFFICE` (Pedir ao escritório).
- **Data safety:** on disable, sessions are revoked and the device may obtain one 72 h drain token for push and media routes only. The server accepts only evidence mutations for reports, media, notes and completion evidence on WOs or rentals assigned at `disabledAt`; anything else is rejected and kept for review.
- **Office sees:** user disabled state, device pending count, drain-token window and evidence-only sends.
- **Priority / owner:** P0 · T03 · refs PLT-01, REC-12, OFF-02, A§5.3 User, A§11, A§21 A3.
- **Test:** auth/sync test: disabled user cannot create new work, but eligible pre-disable evidence drains for 72 h; the full screen offers Ver itens pendentes, Salvar cópia, Pedir ao escritório and diagnostics with no data loss.

#### EC-PLT-04 · Password change needed
- **When:** `mustChangePassword` is true, or the current password must be changed before the app can work offline.
- **Detected by:** `PASSWORD_CHANGE_REQUIRED` (server, new, HTTP 403) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Troque a senha para continuar" / "A troca precisa de internet só desta vez. O que você já fez fica salvo." en: "Change your password to continue" / "This change needs internet only this time. What you already did stays saved."
- **Recovery:** `FIX` (Change password in place), `DRAFT`, `OFFICE`.
- **Data safety:** existing local data is kept; the app does not clear the session until the change succeeds.
- **Office sees:** password-change-required state on the user profile.
- **Priority / owner:** P0 · T03 · refs PLT-01, REC-12, A§5.3 User, A§13.1.
- **Test:** component test: forced password change offline shows sheet, keeps form state, and resumes after connection returns.

#### EC-PLT-05 · Password reset link expired
- **When:** the user opens an expired or already used password reset link.
- **Detected by:** `RESET_LINK_EXPIRED` (server, new, HTTP 410) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Link vencido" / "Solicite um novo link e tente novamente. Nenhum dado do aparelho foi apagado." en: "Link expired" / "Request a new link and try again. No device data was deleted."
- **Recovery:** `RETRY` (Solicitar novo link), `OFFICE`.
- **Data safety:** no local data changes; pending field data stays with its original user.
- **Office sees:** password reset request timestamp and user status.
- **Priority / owner:** P0 · T03 · refs PLT-01, PLT-20, A§13.1, A§11.
- **Test:** route test: expired reset token returns `RESET_LINK_EXPIRED`; UI offers Solicitar novo link as the primary retry action and keeps Help/office as secondary.

#### EC-PLT-06 · Sign in again to send
- **When:** an access token expires, the refresh token expires after 30 days, or sending needs the same user to sign in again with any method the user has.
- **Detected by:** `TOKEN_EXPIRED` (server, HTTP 401, context `mobileSync`) — runtime check for this case.
- **User sees:** banner. pt-BR: "Entre de novo para enviar" / "Você pode continuar trabalhando. Seus itens ficam salvos até você entrar." en: "Sign in again to send" / "You can keep working. Your items stay saved until you sign in."
- **Recovery:** `REAUTH` (same-user sign-in in place with password, Google or Apple), `FALLBACK` (keep working offline), `DRAFT`, `OFFICE`.
- **Data safety:** the current screen, drafts, outbox and media files are kept unchanged; another user cannot see or send this user’s pending data. See also EC-PLT-07 for protected sessions.
- **Office sees:** device last sync and pending counts may become stale; OFF-11 alerts cover devices unsynced over 24 h.
- **Priority / owner:** P0 · T03 · refs REC-12, PLT-01, OFF-02, A§7.9.
- **Test:** integration/chaos test: expired session with pending items shows reauth banner; same-user password, Google or Apple login resumes push without duplicates and different-user login cannot access the queue.

#### EC-PLT-07 · Session was protected
- **When:** refresh token reuse is detected outside the 30 s grace window, or the token family was revoked after possible credential theft.
- **Detected by:** `REFRESH_REUSED` (server, HTTP 401) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Sessão protegida" / "Por segurança, entre de novo neste aparelho. Seus dados locais continuam salvos." en: "Session protected" / "For safety, sign in again on this device. Your local data stays saved."
- **Recovery:** `REAUTH` (Sign in in place), `DRAFT`, `OFFICE`.
- **Data safety:** local data remains protected by the per-user database rules and is not sent until the same user signs in.
- **Office sees:** security log with user, device and token family; device pending counts remain visible.
- **Priority / owner:** P0 · T03 · refs PRD §13 Security, A§5.3 RefreshToken, A§11, A§21.5.
- **Test:** auth integration test: reused refresh token after the grace window revokes family; mobile reauth keeps pending data and screen state, matching Architecture §21.5 recovery (`REAUTH`, `DRAFT`, `OFFICE`).

#### EC-PLT-08 · Access changed while working
- **When:** a user's role or scope change while they are offline or mid-flow, and the next pull/push reports a scope reset.
- **Detected by:** `RESET_REQUIRED` (server, HTTP 409, context `scope`) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Seu acesso mudou" / "Vamos atualizar o que aparece para você. O que você já registrou fica salvo." en: "Your access changed" / "We will update what you can see. What you already recorded stays saved."
- **Recovery:** `FALLBACK` (Refresh local data), `HANDOFF`, `OFFICE`, `AUTO`, `RETRY`.
- **Data safety:** drafts and pending work remain local; captured field work is never rejected for role reasons because sync mutations are allowed for every role; other actions no longer allowed move to Needs attention instead of being discarded.
- **Office sees:** unresolved rejected actions in Needs attention, plus the role-change audit event.
- **Priority / owner:** P0 · T03 · refs PLT-02, OFF-05, REC-12, A§5.3 User.scopeEpoch, A§7.9.
- **Test:** sync test: role changed during offline draft → reset keeps outbox, hides removed tabs, and creates an understandable conflict row.

#### EC-PLT-09 · Pending items on sign out
- **When:** the user taps Sign out with drafts, outbox rows, media files or location rows waiting on the device.
- **Detected by:** `LOGOUT_PENDING_DATA` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Há itens para enviar" / "Eles ficam salvos neste aparelho e só serão enviados quando você entrar de novo. Nada será apagado." en: "Items are waiting to send" / "They stay saved on this device and will send only when you sign in again. Nothing will be deleted."
- **Recovery:** `DRAFT` (Stay signed in), `FALLBACK` (Sign out and keep data), `OFFICE`.
- **Data safety:** pending data remains partitioned under the current user and is not visible after sign-out.
- **Office sees:** device pending counts and oldest pending age.
- **Priority / owner:** P0 · T03 · refs REC-12, OFF-02, A§7.9.
- **Test:** component test: sign-out with pending rows shows both choices; after sign-out another user cannot query those rows.

#### EC-PLT-10 · Camera or microphone blocked
- **When:** camera or microphone permission is denied, denied with "don't ask again", or unavailable during onboarding/capture.
- **Detected by:** `PERMISSION_MEDIA_BLOCKED` (client) — client permission matrix for camera, microphone and photos, including denied, blocked and limited states.
- **User sees:** sheet. pt-BR: "Câmera ou áudio bloqueado" / "Você pode liberar nas configurações ou continuar de outro jeito. O rascunho está salvo." en: "Camera or audio blocked" / "You can allow it in settings or continue another way. The draft is saved."
- **Recovery:** `SETTINGS` (Open settings, Check again), `ALT` (Choose from gallery, Type note), `OFFICE`.
- **Data safety:** wizard state and existing media drafts remain stored locally.
- **Office sees:** nothing unless the user sends diagnostics.
- **Priority / owner:** P0 · T03 · refs PLT-14, UX-11, REC-10, A§13.3, A§13.6.
- **Test:** permission test: denied and permanently denied states show the same recovery sheet with gallery/type alternatives.

#### EC-PLT-11 · Location is limited
- **When:** foreground location, background location, precise location, or iOS approximate-location settings prevent duty tracking, Near me, or arrival help.
- **Detected by:** `PERMISSION_LOCATION_LIMITED` (client) — client permission matrix for foreground/background and precise/approximate location states.
- **User sees:** banner. pt-BR: "Localização limitada" / "Você pode liberar a localização exata ou escolher a fazenda manualmente. Seus registros continuam salvos." en: "Location limited" / "You can allow precise location or choose the farm manually. Your records stay saved."
- **Recovery:** `SETTINGS` (Open location settings, Check again), `ALT` (Pick site/search), `FALLBACK`.
- **Data safety:** forms, drafts and pending location rows already captured are kept.
- **Office sees:** device health shows location unavailable/approximate while on duty.
- **Priority / owner:** P0 · T03 · refs PLT-04, PLT-05, PLT-14, REC-10, A§7.8, A§13.6.
- **Test:** component tests for denied, approximate and background-off states → banner plus manual site fallback.

#### EC-PLT-12 · Location consent not given
- **When:** the user turns On duty without accepting LGPD location consent, or later revokes consent.
- **Detected by:** `LOCATION_CONSENT_REQUIRED` (server, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Confirme o uso da localização" / "A central só vê sua localização enquanto você estiver em serviço. Sem aceitar, você fica fora de serviço e seus dados ficam salvos." en: "Confirm location use" / "The office sees your location only while you are on duty. Without accepting, you stay off duty and your data stays saved."
- **Recovery:** `FIX` (Read and accept consent), `FALLBACK` (Stay off duty), `OFFICE`.
- **Data safety:** the duty switch is not applied; drafts and work already created are unchanged.
- **Office sees:** user remains Off duty; consent timestamp remains empty or revoked.
- **Priority / owner:** P0 · T03 · refs PLT-04, PRD §13 Privacy, A§5.3 User, A§11.
- **Test:** mutation test: `user.setDuty` without consent → `LOCATION_CONSENT_REQUIRED`; UI offers accept/stay off duty.

#### EC-PLT-13 · Notifications are off
- **When:** OS notifications are denied, disabled for the app, the push token is invalid, or delivery keeps failing.
- **Detected by:** `PERMISSION_NOTIFICATIONS_OFF` (client) — client permission matrix and device push status.
- **User sees:** banner. pt-BR: "Alertas desligados" / "Você ainda vê seus serviços ao abrir o app. Ative os alertas para não perder mudanças." en: "Alerts are off" / "You still see your jobs when you open the app. Turn alerts on so you do not miss changes."
- **Recovery:** `SETTINGS` (Open notification settings, Check again), `FALLBACK` (Open Today), `OFFICE`.
- **Data safety:** no work data is affected; missed notifications are visible through app data when it refreshes.
- **Office sees:** device notification token status and failed-delivery count on Team → Devices.
- **Priority / owner:** P0 · T03 · refs PLT-07, PLT-14, REC-10, A§13.6.
- **Test:** notification permission test: denied/permanently denied → banner; opening settings then enabling clears it.

#### EC-PLT-14 · Device storage is full
- **When:** free space is below the warning threshold, a local database write cannot extend, or capture would fail because the phone is almost full.
- **Detected by:** `DEVICE_STORAGE_FULL` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Pouco espaço no aparelho" / "Libere espaço para continuar. O rascunho e os arquivos já salvos estão seguros." en: "Device storage is low" / "Free space to continue. The draft and saved files are safe."
- **Recovery:** `SETTINGS` (Open storage settings, Check again), `RETRY` (Check again), `DRAFT`, `ALT` (Continue without video when allowed), `OFFICE`.
- **Data safety:** existing committed rows, drafts and media files remain; database writes are transactional and recording-specific storage recovery is EC-SYN-14.
- **Office sees:** device free-storage value and pending bytes on Team → Devices after the next successful contact.
- **Priority / owner:** P0 · T03 · refs OFF-10, A§7.10, A§13.3.
- **Test:** storage guard and DB-write tests: low space blocks risky writes/capture, no partial transaction is committed, and the existing outbox remains intact.

#### EC-PLT-15 · Background work is blocked
- **When:** Android battery saver or OEM settings on Xiaomi, Samsung or Motorola stop background sending, location or notifications.
- **Detected by:** `BATTERY_BACKGROUND_RESTRICTED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "O celular está limitando o app" / "Abra as configurações para manter envios e localização funcionando. O que já foi feito está salvo." en: "The phone is limiting the app" / "Open settings to keep sending and location working. What you already did is saved."
- **Recovery:** `SETTINGS` (Open battery/app settings, Check again), `FALLBACK`, `DIAG`.
- **Data safety:** outbox, drafts and location buffers remain queued and resume when the app can run.
- **Office sees:** device may become stale; diagnostics include manufacturer and battery optimization state.
- **Priority / owner:** P0 · T03 · refs OFF-03, OFF-09, OFF-11, A§7.10, A§13.6.
- **Test:** device-health unit test maps manufacturer-specific restriction states to the same recovery sheet.

#### EC-PLT-16 · Network is restricted
- **When:** mobile data is blocked for the app, data saver prevents background data, or every health probe times out even though the phone seems connected.
- **Detected by:** `NETWORK_RESTRICTED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "A conexão está bloqueada" / "Você pode continuar trabalhando. Libere dados móveis para o app ou use outra rede para enviar." en: "Connection is restricted" / "You can keep working. Allow mobile data for the app or use another network to send."
- **Recovery:** `SETTINGS` (Open mobile data/data saver settings), `RETRY` (Check again), `FALLBACK` (Keep working offline).
- **Data safety:** all new work stays durable in the local database and queues.
- **Office sees:** last sync time ages; stale device alert may fire after 24 h.
- **Priority / owner:** P0 · T03 · refs OFF-01, OFF-03, OFF-11, A§7.10.
- **Test:** NetInfo/health-probe test: data saver or repeated probe timeout shows restricted-network banner, keeps field routes usable and retries after settings change.

#### EC-PLT-17 · Phone clock looks wrong
- **When:** device time or time zone differs from `serverTime` by more than 5 minutes, risking confusing audit times.
- **Detected by:** `DEVICE_CLOCK_SKEWED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Horário do celular diferente" / "Ajuste para horário automático quando puder. Seus registros ficam salvos com segurança." en: "Phone time looks different" / "Set automatic time when you can. Your records stay safely saved."
- **Recovery:** `SETTINGS` (Open date/time settings, Check again), `FALLBACK` (server keeps the measured offset).
- **Data safety:** records keep device time plus `clockOffsetMs`; push order still follows outbox sequence and future times are clamped safely.
- **Office sees:** activity metadata shows the corrected time and device skew so events can be ordered without blaming the user.
- **Priority / owner:** P0 · T03 · refs PLT-13, OFF-04, A§7.3.
- **Test:** push/chaos test: 3 h clock skew shows the banner, preserves mutation order, stores `clockOffsetMs` and lets the user keep working.

#### EC-PLT-18 · Phone memory interrupted capture
- **When:** the OS kills or pauses AgroRende during camera, OCR, PDF preview or a long wizard because memory is low.
- **Detected by:** `DEVICE_MEMORY_LOW` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "O celular fechou a etapa" / "Reabrimos de onde parou. O rascunho e os arquivos já salvos estão seguros." en: "The phone closed this step" / "We reopened where you stopped. The draft and files already saved are safe."
- **Recovery:** `DRAFT` (Resume draft), `RETRY` (Reload step), `ALT` (Skip heavy step when allowed), `DIAG`.
- **Data safety:** autosaved draft state survives app kill and low-memory restarts.
- **Office sees:** nothing unless diagnostics are sent.
- **Priority / owner:** P0 · T03 · refs UX-04, REC-11, OFF-02, A§13.3.
- **Test:** e2e/device test: simulated app kill during capture → next launch offers Resume draft at the same step.

#### EC-PLT-19 · App update required
- **When:** the server or release policy requires a newer app/runtime before pending work can be sent.
- **Detected by:** `APP_UPDATE_REQUIRED` (server, new, HTTP 426) — server route app-version policy or unknown mutation classification.
- **User sees:** full screen. pt-BR: "Atualize o AgroRende" / "A atualização mantém seus dados locais. Depois, volte para enviar o que está pendente." en: "Update AgroRende" / "The update keeps your local data. Then come back to send what is pending."
- **Recovery:** `UPDATE` (Open store or reload update), `DRAFT`, `OFFICE`.
- **Data safety:** local database, outbox and media remain untouched until the updated app processes them.
- **Office sees:** device appVersion/runtimeVersion behind required version on Team → Devices.
- **Priority / owner:** P0 · T03 · refs OFF-12, A§7.3, A§18.4.
- **Test:** sync test: required-version response maps to `APP_UPDATE_REQUIRED`, shows update full screen and leaves outbox rows pending.

#### EC-PLT-20 · Update could not install
- **When:** an OTA update download, verification or reload fails.
- **Detected by:** `OTA_UPDATE_FAILED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Atualização não instalou" / "Tente de novo ou continue na versão atual por enquanto. Seus dados estão seguros." en: "Update did not install" / "Try again or keep using the current version for now. Your data is safe."
- **Recovery:** `RETRY` (Try update again), `FALLBACK` (Continue current version), `UPDATE`, `DIAG`.
- **Data safety:** the current app bundle keeps running; local data is not migrated or deleted by a failed OTA.
- **Office sees:** diagnostics include update channel, runtime and failure reason.
- **Priority / owner:** P0 · T03 · refs OFF-12, A§13.6, A§18.4.
- **Test:** updates module test: failed OTA shows recoverable sheet and does not trigger migration.

#### EC-PLT-21 · Screen reloaded safely
- **When:** a screen throws an unexpected error or the app restarts after a crash.
- **Detected by:** `SCREEN_CRASHED` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Algo falhou nesta tela" / "Recarregue a tela ou volte para Hoje. Seus dados e rascunhos estão salvos." en: "Something failed on this screen" / "Reload the screen or go back to Today. Your data and drafts are saved."
- **Recovery:** `RETRY` (Reload screen), `FALLBACK` (Go to Today), `DRAFT` (Resume draft), `DIAG`.
- **Data safety:** autosaved drafts and pending queues survive the crash and are offered on next launch.
- **Office sees:** diagnostics/Sentry event without form contents or PII.
- **Priority / owner:** P0 · T03 · refs REC-11, UX-09, A§13.1.
- **Test:** error-boundary test: thrown render error shows full-screen recovery; crash-resume opens the draft at the same step.

#### EC-PLT-22 · Language falls back safely
- **When:** the device language is unsupported, a user switches language while offline, or a translation key is missing.
- **Detected by:** `LOCALE_FALLBACK_USED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Idioma ajustado" / "Mostramos o melhor idioma disponível no aparelho. Seus dados não mudam." en: "Language adjusted" / "We show the best available language on the device. Your data does not change."
- **Recovery:** `FALLBACK` (Use pt-BR/en fallback), `SETTINGS` (Choose language).
- **Data safety:** only labels change; user-written text remains as typed.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T03 · refs PLT-03, PLT-15, I§1-I§2, A§19.
- **Test:** i18n test: unsupported `es-AR`, offline language switch and missing key all fall back without crashing.

#### EC-PLT-23 · Number format not clear
- **When:** a number field contains an ambiguous decimal/thousands value or characters that cannot be parsed for the current locale.
- **Detected by:** `INVALID_LOCALE_NUMBER` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Número não entendido" / "Use vírgula ou ponto para decimal, por exemplo 12,5. O valor digitado fica na tela." en: "Number not understood" / "Use a comma or dot for decimals, for example 12.5. The value stays on screen."
- **Recovery:** `FIX` (focus field, show example).
- **Data safety:** the raw input is kept until the user fixes it.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T03 · refs REC-13, PLT-15, UX-09, A§20.
- **Test:** unit tests for `parseLocaleNumber`: accepts `12,5` and `12.5`; rejects ambiguous thousands with inline copy.

#### EC-PLT-24 · QR code could not be read
- **When:** a QR/barcode is dirty, damaged, too small, in glare, or the camera cannot focus in the field.
- **Detected by:** `SCAN_UNREADABLE` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Não deu para ler o QR" / "Limpe a etiqueta, mude o ângulo ou digite o código. O rascunho está salvo." en: "QR could not be read" / "Clean the tag, change the angle, or type the code. The draft is saved."
- **Recovery:** `ALT` (Type code, Search asset, Recent), `RETRY` (Scan again), `OFFICE`.
- **Data safety:** the user stays in the same lookup or wizard step; no captured evidence is removed.
- **Office sees:** nothing unless diagnostics are sent.
- **Priority / owner:** P0 · T03 · refs PLT-05, A§13.1, A§13.3.
- **Test:** scanner component test: no decoded value after retry window → sheet with type-code and search alternatives.

#### EC-PLT-25 · QR belongs to another company
- **When:** the scanned QR encodes a different organization, environment or deployment than the signed-in user's organization.
- **Detected by:** `ASSET_QR_OTHER_ORG` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Etiqueta de outra empresa" / "Procure a máquina pelo código ou nome no AgroRende. O rascunho continua salvo." en: "Tag from another company" / "Search for the machine by code or name in AgroRende. The draft stays saved."
- **Recovery:** `ALT` (Search, Type code, Recent), `OFFICE`.
- **Data safety:** the scan is ignored; no cross-company data is shown or stored.
- **Office sees:** optional diagnostic with scanned prefix only, not the foreign asset data.
- **Priority / owner:** P0 · T03 · refs PLT-05, PRD §13 Security, A§11.
- **Test:** QR parser test: other-org payload never queries or displays the foreign asset; recovery alternatives appear.

#### EC-PLT-26 · Asset not available on device
- **When:** asset lookup finds no local result, or the asset is retired/hidden from the user's offline scope.
- **Detected by:** `ASSET_LOOKUP_UNAVAILABLE` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Máquina não encontrada aqui" / "Seu rascunho está salvo. Busque pelo código ou toque em Máquina não cadastrada." en: "Machine not found here" / "Your draft is saved. Search by code or tap Machine not registered."
- **Recovery:** `ALT` (Search, Recent, Not registered), `FALLBACK`, `OFFICE`.
- **Data safety:** the app does not delete the draft or captured evidence; later send may attach the office decision.
- **Office sees:** if submitted as unregistered, the item appears for office triage/linking.
- **Priority / owner:** P0 · T03 · refs PLT-05, OFF-07, A§13.3.
- **Test:** asset picker test: retired/missing local asset → no dead end, shows Not registered only where allowed.

#### EC-PLT-27 · Serial number not read
- **When:** serial OCR fails because the plate is muddy, scratched, low contrast, curved or in glare.
- **Detected by:** `SERIAL_OCR_FAILED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Número de série não lido" / "Digite o número ou procure pelo nome da máquina. O rascunho está salvo." en: "Serial number not read" / "Type the number or search by machine name. The draft is saved."
- **Recovery:** `ALT` (Type serial, Search), `RETRY` (Try photo again), `OFFICE`.
- **Data safety:** the photo draft remains available if the user wants to attach it.
- **Office sees:** nothing unless the photo is later submitted as evidence.
- **Priority / owner:** P0 · T03 · refs PLT-05, UX-05, A§13.3.
- **Test:** OCR test: low-confidence result triggers manual serial entry and preserves image draft.

#### EC-PLT-28 · Offline search found nothing
- **When:** asset search runs offline and the local dataset has no matching asset, plate or serial.
- **Detected by:** `OFFLINE_SEARCH_NO_RESULTS` (client) — runtime check for this case.
- **User sees:** empty state. pt-BR: "Nada encontrado neste aparelho" / "Revise o texto ou use Recentes. Os dados que você já colocou continuam salvos." en: "Nothing found on this device" / "Check the text or use Recent. The data you already entered stays saved."
- **Recovery:** `FIX` (edit query), `ALT` (Recent, Scan, Not registered where allowed), `FALLBACK`.
- **Data safety:** current form state remains in memory/draft.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T03 · refs PLT-05, OFF-07, A§13.1.
- **Test:** offline asset list test: no local matches → empty state with edit/recent alternatives, not a blocking error.

#### EC-PLT-29 · Near me needs location
- **When:** the user taps Near me but GPS is unavailable, permission is denied, or the last fix is too old.
- **Detected by:** `GPS_UNAVAILABLE` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Sem localização agora" / "Escolha a fazenda ou busque a máquina pelo código. Seu trabalho fica salvo." en: "No location right now" / "Choose the farm or search for the machine by code. Your work stays saved."
- **Recovery:** `ALT` (Pick site, Search, Recent), `SETTINGS`, `RETRY` (Try location again).
- **Data safety:** lookup state and wizard progress are kept.
- **Office sees:** device health may show location unavailable while on duty.
- **Priority / owner:** P0 · T03 · refs PLT-05, REC-10, A§13.3.
- **Test:** asset picker test: GPS unavailable disables only Near me and leaves scan/search/recent usable.

#### EC-PLT-30 · PDF cannot be shared now
- **When:** the user taps Share PDF for a WO report or rental hand-over/return report while offline, before the PDF exists, or with no app that can receive the share.
- **Detected by:** `PDF_SHARE_UNAVAILABLE` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Relatório ainda não pode ser compartilhado" / "Ele ficará disponível depois do envio ou quando houver um app para compartilhar. Os dados estão salvos." en: "Report cannot be shared yet" / "It will be available after sending or when a sharing app is available. The data is saved."
- **Recovery:** `FALLBACK` (Wait until sent/generated), `ALT` (Copy summary or save file when available), `OFFICE`.
- **Data safety:** the source WO or rental data, pending PDF request and local completion draft remain intact; generation failures use area-specific entries such as EC-RN-15.
- **Office sees:** nothing unless the completion/check-in is stuck or the user asks the office to send the PDF.
- **Priority / owner:** P0 · T03 · refs PLT-11, A§13.1; T07/T08 call the shared recovery.
- **Test:** component tests for WO and rental share buttons: offline/no share target/before-generation states show wait/copy/save alternatives and never lose source data.

#### EC-PLT-31 · Diagnostics not sent yet
- **When:** Settings → Help → Send diagnostics fails because the device is offline, the upload endpoint rejects it, or the payload is too large.
- **Detected by:** `DIAGNOSTICS_SEND_FAILED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Diagnóstico guardado" / "Vamos tentar enviar depois. Ele não inclui conteúdo dos formulários nem dados pessoais." en: "Diagnostics saved" / "We will try to send it later. It does not include form contents or personal data."
- **Recovery:** `AUTO` (queue for later), `RETRY` (Try again), `OFFICE`.
- **Data safety:** diagnostics are redacted; user work and PII are not included. A diagnostics upload over 256 KB is rejected by the server with `VALIDATION_FAILED` (422) before redaction runs; the client then drops the oldest diagnostics rows and retries automatically, so the user still sees only this banner.
- **Office sees:** queued diagnostics appear on the device page once sent.
- **Priority / owner:** P0 · T03 · refs REC-08, A§21, A§7.10.
- **Test:** diagnostics test: offline send queues redacted payload ≤ 256 KB and later retry creates a device diagnostic.

#### EC-PLT-32 · Office contact missing
- **When:** an error offers Ask the office, but `officePhone` and `officeWhatsApp` are not configured for the organization.
- **Detected by:** `OFFICE_CONTACT_MISSING` (client, context `recovery`) — runtime check for this case; settings uses `OFFICE_CONTACT_MISSING.settings` in EC-OPS-25.
- **User sees:** sheet. pt-BR: "Contato da central não configurado" / "Use Enviar diagnóstico ou fale pelo canal que sua equipe já usa. Seus dados estão salvos." en: "Office contact not set" / "Use Send diagnostics or contact the channel your team already uses. Your data is saved."
- **Recovery:** `DIAG` (Send diagnostics), `FALLBACK`, `HANDOFF`.
- **Data safety:** the original error and context stay available; no local work is discarded.
- **Office sees:** settings gap on Organization settings; diagnostics/Needs attention item includes missing contact flag.
- **Priority / owner:** P0 · T03 · refs REC-07, A§21 Org settings, D§3 T04 settings.
- **Test:** recovery-kit test: `OFFICE_CONTACT_MISSING.recovery` replaces Call/WhatsApp with diagnostics and handoff when no contact is configured.

#### EC-PLT-33 · Another user has pending data
- **When:** a shared tablet signs in as a different user while the previous user has drafts or pending items on the device.
- **Detected by:** `SHARED_DEVICE_PENDING_DATA` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Há dados de outro usuário" / "Eles ficam separados e protegidos. Entre com a outra conta para enviar esses itens." en: "Another user has data here" / "It stays separate and protected. Sign in with that account to send those items."
- **Recovery:** `REAUTH` (Switch back to that user), `FALLBACK` (Continue as current user), `OFFICE`.
- **Data safety:** per-user database files keep data separate; the current user cannot view or send the other user's items.
- **Office sees:** device page shows pending counts per last signed-in user, without exposing record contents.
- **Priority / owner:** P0 · T03 · refs PLT-12, REC-12, A§7.9, G2.4.
- **Test:** multi-user device test: User B signs in after User A has pending rows; B sees only summary count and cannot open A’s data. Fast user switching polish remains P1/T17.

#### EC-PLT-34 · Account not in a team yet
- **When:** a Google or Apple identity signs in without a valid invite, matching invited user, or existing organization membership.
- **Detected by:** `ACCOUNT_NOT_INVITED` (server, new, HTTP 403) — identity resolution after provider sign-in.
- **User sees:** full screen. pt-BR: "Esta conta ainda não está em uma equipe" / "Peça um convite ao escritório ou crie sua empresa. E-mail usado: {email}." en: "This account isn't in a team yet" / "Ask your office for an invite or create your company. Email used: {email}."
- **Recovery:** `FIX` (Tenho um código de convite, Usar outra conta), `OFFICE` (Criar uma empresa as secondary).
- **Data safety:** no local work is created for the unknown account; any existing locked local database for another user stays sealed.
- **Office sees:** nothing unless the person shares the shown email; sign-in logs include the request ref without creating a user.
- **Priority / owner:** P0 · T03/T02 · refs PLT-01, PLT-19, TEN-01, A§7.9, A§8, A§11, A§13.
- **Test:** unknown Google identity without invite → screen with the email and three actions.

#### EC-PLT-35 · Invite no longer valid
- **When:** the user opens or types an invite code that is expired, already used, revoked or malformed after normalization.
- **Detected by:** `INVITE_EXPIRED` (server, new, HTTP 410) — public invite lookup or redemption route.
- **User sees:** sheet. pt-BR: "Convite vencido ou já usado" / "Peça um convite novo a quem te chamou." en: "Invite expired or already used" / "Ask whoever invited you for a new one."
- **Recovery:** `OFFICE` (ask for a new invite), `FIX` (type another code).
- **Data safety:** no account is joined and no local work is changed; any typed code stays visible for correction until the user leaves the sheet.
- **Office sees:** invite state and resend action on Team; failed lookup logs are rate-limited by IP.
- **Priority / owner:** P0 · T02/T03/T04 · refs PLT-19, PLT-20, A§8, A§13, A§14.
- **Test:** expired, used and revoked invite fixtures return `INVITE_EXPIRED`; app and web offer new-invite and type-another-code paths.

#### EC-PLT-36 · Office invite needs the invited email
- **When:** an ADMIN or MANAGER invite is redeemed with a Google or Apple account whose verified email does not match the invite email.
- **Detected by:** `INVITE_EMAIL_MISMATCH` (server, new, HTTP 403) — invite redemption identity check.
- **User sees:** full screen. pt-BR: "Use o e-mail do convite" / "Este convite de {role} é para {emailHint}. Entre com essa conta ou peça outro convite." en: "Use the invited email" / "This {role} invite is for {emailHint}. Sign in with that account or ask for a new invite."
- **Recovery:** `FIX` (Use that account), `OFFICE` (ask for a corrected invite).
- **Data safety:** the invite remains unredeemed; no identity is linked to the wrong person and no local data is deleted.
- **Office sees:** the invite remains pending; Team shows resend/revoke and the failed attempt ref.
- **Priority / owner:** P0 · T02/T04 · refs PLT-19, PLT-22, A§8, A§11, A§13, A§14.
- **Test:** ADMIN/MANAGER invite with mismatched Google email returns `INVITE_EMAIL_MISMATCH` and keeps the invite available for the intended email.

#### EC-PLT-37 · Account already belongs to another company
- **When:** a Google or Apple identity already linked to one organization tries to redeem an invite or join a different organization.
- **Detected by:** `ACCOUNT_IN_OTHER_ORG` (server, new, HTTP 409) — identity resolution before invite redemption.
- **User sees:** full screen. pt-BR: "Esta conta já está em outra empresa" / "Use outra conta Google/Apple ou peça para a outra empresa remover você." en: "This account is already in another company" / "Use another Google/Apple account or ask the other company to remove you."
- **Recovery:** `FIX` (Use another account), `OFFICE` (ask for help from the current company).
- **Data safety:** the existing organization membership is unchanged and the new invite is not consumed.
- **Office sees:** the target invite remains pending; support can use the request ref, but no tenant data is exposed across companies.
- **Priority / owner:** P0 · T03/T02 · refs PLT-01, PLT-19, TEN-01, TEN-09, A§8, A§11, A§13.
- **Test:** identity from organization A redeems organization B invite → `ACCOUNT_IN_OTHER_ORG`, invite still usable by another account.

#### EC-PLT-38 · Sign-in took too long
- **When:** the OAuth callback or mobile exchange arrives after the saved state/login code expired, was already used, or is missing.
- **Detected by:** `OAUTH_STATE_EXPIRED` (server, new, HTTP 400) — OAuth callback and mobile exchange state checks.
- **User sees:** inline. pt-BR: "O login demorou demais" / "Toque para tentar de novo." en: "Sign-in took too long" / "Tap to try again."
- **Recovery:** `RETRY` (start sign-in again).
- **Data safety:** no session or identity is created from the stale callback; existing local work remains locked to its user.
- **Office sees:** auth log with expired state reason and request ref, no provider token contents.
- **Priority / owner:** P0 · T03/T02 · refs PLT-01, A§7.9, A§8, A§11, A§13.
- **Test:** expired OAuth state or login code shows inline retry and does not issue tokens.

#### EC-PLT-39 · Google or Apple did not answer
- **When:** Google or Apple token exchange, ID-token verification or provider callback times out or fails transiently.
- **Detected by:** `OAUTH_PROVIDER_ERROR` (server, new, HTTP 502) — OAuth provider exchange and verification wrapper.
- **User sees:** inline. pt-BR: "Google/Apple não respondeu" / "Tente de novo em instantes ou entre com e-mail e senha." en: "Google/Apple didn't respond" / "Try again shortly or sign in with email and password."
- **Recovery:** `RETRY` (try provider sign-in again), `FALLBACK` (email and password when available).
- **Data safety:** no partial sign-in is stored; pending local work remains on the device and can be sent after successful same-user sign-in.
- **Office sees:** grouped auth-provider error metrics and request refs, without provider tokens.
- **Priority / owner:** P0 · T03/T02 · refs PLT-01, A§7.9, A§8, A§11, A§13.
- **Test:** provider timeout/502 returns `OAUTH_PROVIDER_ERROR`; UI offers retry and email/password fallback without clearing typed data.

#### EC-PLT-40 · Company access paused (field)
- **When:** the organization is SUSPENDED or CANCELLED and field sync is in the 7-day grace period or later hourly hold.
- **Detected by:** `ORG_SUSPENDED` (server, new, HTTP 403) — org-status gate on sync push and auth/me status refresh.
- **User sees:** banner. pt-BR: "Acesso da empresa pausado" / "Continue registrando: tudo fica salvo e será enviado quando a empresa voltar." en: "Company access paused" / "Keep recording: everything stays saved and will send when the company is back."
- **Recovery:** `FALLBACK` (keep working read/offline), `OFFICE` (contact the office), `AUTO` (hourly retry and sync poke on reactivation).
- **Data safety:** push is accepted for 7 days after suspension; after that the outbox is kept on the device, retried hourly and never discarded.
- **Office sees:** subscription page and platform console status, suspendedAt/cancelledAt, grace window and device pending counts.
- **Priority / owner:** P0 · T03/T20/T02 · refs TEN-02, TEN-03, TEN-04, TEN-07, A§7.9, A§8, A§11, A§13, A§14.
- **Test:** chaos — suspended org, pending outbox, grace then hold, reactivation flushes without duplicates.

#### EC-PLT-41 · Sign-in cancelled
- **When:** the user closes, cancels or dismisses the Google/Apple browser or native Apple sign-in sheet before it returns.
- **Detected by:** `OAUTH_CANCELLED` (client) — mobile/web sign-in result from the OAuth or native Apple session.
- **User sees:** inline. pt-BR: "Login cancelado" / "Escolha uma forma de entrar." en: "Sign-in cancelled" / "Choose a way to sign in."
- **Recovery:** `RETRY` (choose a sign-in method again).
- **Data safety:** nothing changes on the device; drafts and outbox rows remain locked to the previous signed-in user if any.
- **Office sees:** nothing; this quiet client-only state does not create support noise.
- **Priority / owner:** P0 · T03 · refs PLT-01, A§7.9, A§13.
- **Test:** cancelling Google browser flow and native Apple sheet shows quiet inline copy and keeps the login form usable.

#### EC-PLT-42 · Delete account with items waiting
- **When:** the user starts account deletion while this device has drafts, outbox rows, media or location rows waiting to send.
- **Detected by:** `ACCOUNT_DELETE_PENDING_DATA` (client) — account settings guard before delete confirmation.
- **User sees:** sheet. pt-BR: "Há itens para enviar" / "Envie agora ou salve uma cópia antes de excluir a conta. Nada será descartado neste aparelho." en: "Items are waiting to send" / "Send them now or save a copy before deleting the account. Nothing will be discarded on this device."
- **Recovery:** `RETRY` (Enviar agora), `FIX` (Salvar cópia).
- **Data safety:** the device refuses account deletion while the outbox or media queue is not empty; no local pending item is discarded. Server `DELETE /auth/me` anonymizes only after the device is clear.
- **Office sees:** synced work if the user sends first; otherwise no deletion proceeds from this device until pending data is cleared or copied. After deletion, the `auth.appleRevoke` job revokes the Apple token with retries; when all 5 attempts fail, the job stays in the BullMQ failed set with the internal reason `APPLE_REVOKE_FAILED` and the Apple identity is not deleted. Support retries the job (recovery `OFFICE`); this reason is not a catalogued code and the user sees no message.
- **Priority / owner:** P0 · T03/T02/T12 · refs PLT-21, PLT-22, O15, A§8, A§11, A§13.
- **Test:** account deletion with pending items shows Enviar agora and Salvar cópia, keeps the delete action disabled, and asserts no pending local item is discarded.

#### EC-PLT-43 · Sign in required
- **When:** a protected app, web or API surface has no valid session yet, or a cleared browser/mobile session opens a deep link.
- **Detected by:** `UNAUTHENTICATED` (server, HTTP 401) — auth guard before protected data is read.
- **User sees:** full screen. pt-BR: "Entre para continuar" / "Seus rascunhos deste aparelho continuam salvos. Entre com a mesma conta para enviar." en: "Sign in to continue" / "Your drafts on this device stay saved. Sign in with the same account to send."
- **Recovery:** `REAUTH` (Sign in), `DRAFT` (keep local draft), `OFFICE`.
- **Data safety:** no tenant data is returned without a session; local drafts/outbox remain sealed to the original user.
- **Office sees:** auth log with request ref only when a protected API route was attempted.
- **Priority / owner:** P0 · T03/T04/T02 · refs PLT-01, REC-12, A§8, A§11, A§21.
- **Test:** route/component test: protected deep link without a session shows sign-in, preserves local draft state and returns to the intended screen after same-user auth.

## 5. Sync and media (EC-SYN)

#### EC-SYN-01 · Too many items waiting
- **When:** the outbox has 500+ pending actions, 5 GB+ of pending media metadata/files, or local Sync Center queries are slowing down.
- **Detected by:** `OUTBOX_BACKLOG` (client) — runtime check for this case.
- **User sees:** banner + Sync Center card. pt-BR: "Muitos itens esperando envio" / "Seus dados estão guardados neste aparelho. O app vai enviar em partes; deixe aberto quando tiver sinal." en: "Many items waiting to send" / "Your data is safe on this device. The app will send it in parts; keep it open when you have signal."
- **Recovery:** `AUTO` (batch drain), `RETRY` (Sync now), `DIAG`, `OFFICE`.
- **Data safety:** outbox rows and media files remain durable; batching is idempotent and order-preserving.
- **Office sees:** device health shows pending counts and bytes; alert if older than 24 h.
- **Priority / owner:** P0 · T03 · refs PLT-09, OFF-06, OFF-10, A§7.10.
- **Test:** chaos T12 C9: 500 pending mutations + 5 GB fake media drain in order and Sync Center queries stay under 100 ms; component test shows card and actions.

#### EC-SYN-02 · One item is stuck
- **When:** one outbox row reaches max backoff for more than 24 h while later rows wait behind it.
- **Detected by:** `OUTBOX_ITEM_STUCK` (client) — runtime check for this case.
- **User sees:** Sync Center sheet. pt-BR: "Um item está parado" / "Seus dados estão guardados. Tente enviar de novo ou mande um diagnóstico para a central." en: "One item is stuck" / "Your data is safe. Try sending again or send diagnostics to the office."
- **Recovery:** `RETRY` (Try again), `DIAG`, `OFFICE`.
- **Data safety:** the row stays in the outbox with `lastError`; no later command is reordered around it.
- **Office sees:** Needs attention item if it remains stuck over 24 h or diagnostics are sent.
- **Priority / owner:** P0 · T03 · refs PLT-09, OFF-05, OFF-06, REC-08, REC-09.
- **Test:** chaos T12: inject a permanent retryable failure for mutation #1, assert later rows wait, Retry reuses the same mutation id, and diagnostics include only sync summary.

#### EC-SYN-03 · Only part of the batch was sent
- **When:** push applies early mutations in a batch, then returns `RETRY` or omits later mutations after a retryable failure.
- **Detected by:** `PUSH_PARTIAL_RETRY` (client) — runtime check for this case.
- **User sees:** Sync Center row state. pt-BR: "Alguns itens ainda estão na fila" / "O que já foi enviado está seguro. O restante ficou guardado e vai continuar na ordem certa." en: "Some items are still in line" / "What was sent is safe. The rest is saved and will continue in the right order."
- **Recovery:** `AUTO` (backoff), `RETRY` (Sync now).
- **Data safety:** APPLIED rows are deleted only after stored server results are applied; omitted rows remain pending with original sequence.
- **Office sees:** applied items appear normally; pending counts remain on device health.
- **Priority / owner:** P0 · T03 · refs OFF-04, OFF-06, OFF-13, A§7.3.
- **Test:** chaos T12 C10: HTTP 500 on mutation #3 applies #1–#2, retries #3+ later, and creates no duplicate activity events.

#### EC-SYN-04 · Service is unstable
- **When:** `/sync/push`, `/sync/pull`, or media routes return `INTERNAL`, 5xx, DNS failures, or time out repeatedly.
- **Detected by:** `INTERNAL` (server, HTTP 500) — runtime check for this case.
- **User sees:** banner. pt-BR: "Envio pausado por instabilidade" / "Seus dados estão guardados. O app vai tentar de novo sozinho." en: "Sending paused for instability" / "Your data is safe. The app will try again by itself."
- **Recovery:** `AUTO` (backoff), `RETRY` (Sync now), `FALLBACK` (keep working offline), `DIAG`.
- **Data safety:** local writes, files and drafts stay on device; retries are idempotent.
- **Office sees:** device last sync and pending counts grow; outage telemetry groups by `INTERNAL` refs.
- **Priority / owner:** P0 · T03 · refs OFF-01, OFF-02, OFF-13, A§7.3, A§7.10.
- **Test:** chaos T12: drop responses and return 500 across sync/media routes, assert no duplicates, automatic retry badge, and user can keep creating records.

#### EC-SYN-05 · Wi‑Fi needs a login
- **When:** NetInfo reports Wi‑Fi, but a lightweight health probe receives a captive portal page or redirect instead of the expected JSON.
- **Detected by:** `CAPTIVE_PORTAL` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "O Wi‑Fi pede login" / "Seus dados estão guardados. Abra a página do Wi‑Fi ou use dados móveis para enviar." en: "Wi‑Fi needs a login" / "Your data is safe. Open the Wi‑Fi login page or use mobile data to send."
- **Recovery:** `ALT` (Open Wi‑Fi login, Use mobile data), `AUTO` (retry after probe succeeds), `FALLBACK`.
- **Data safety:** nothing is sent to the captive portal; queued work remains local.
- **Office sees:** device appears unsynced until the user connects; no false server error ref.
- **Priority / owner:** P0 · T03 · refs OFF-03, OFF-06, OFF-13, A§7.10.
- **Test:** chaos T12: health probe returns HTML/302, assert captive portal copy, no push attempts with credentials, and Auto resumes after JSON probe.

#### EC-SYN-06 · Connection is very slow
- **When:** throughput stays below the low-bandwidth threshold or the device reports 2G/EDGE while uploads are pending.
- **Detected by:** `SLOW_CONNECTION` (client) — runtime check for this case.
- **User sees:** banner + media queue hint. pt-BR: "Conexão muito lenta" / "Seus dados estão guardados. Fotos e prévias vão primeiro; vídeos podem esperar por Wi‑Fi." en: "Connection is very slow" / "Your data is safe. Photos and previews go first; videos can wait for Wi‑Fi."
- **Recovery:** `AUTO` (prioritize small items), `ALT` (wait for Wi‑Fi, allow one video on mobile data), `FALLBACK`.
- **Data safety:** all files remain queued; upload priority prevents large videos from starving forms and thumbnails.
- **Office sees:** partial evidence may arrive first; pending bytes remain visible on the device page.
- **Priority / owner:** P0 · T03 · refs OFF-03, OFF-08, OFF-10, A§7.7.
- **Test:** chaos T12: throttle bandwidth, assert forms/photos/thumbs complete before videos and Sync Center explains the delay.

#### EC-SYN-07 · Sending is being paced
- **When:** sync push or media URL routes return `RATE_LIMITED` (429).
- **Detected by:** `RATE_LIMITED` (server, HTTP 429, default sync context) — runtime check for this case; login uses `RATE_LIMITED.login` in EC-OPS-01.
- **User sees:** Sync Center banner. pt-BR: "Vamos enviar em pequenos grupos" / "Seus dados estão guardados. Há muitos pedidos agora, então o app vai esperar um pouco." en: "We’ll send in small groups" / "Your data is safe. There are many requests right now, so the app will wait a little."
- **Recovery:** `AUTO` (respect `Retry-After`), `RETRY` (after wait), `OFFICE`.
- **Data safety:** no row is dropped; next attempt keeps the same mutation ids or media upload state.
- **Office sees:** rate-limit events in logs; device health still shows pending counts.
- **Priority / owner:** P0 · T03 · refs A§8, A§11 rate limits, OFF-13.
- **Test:** unit test for retry scheduler honors `Retry-After`; chaos T12 returns 429 and asserts no rapid retry loop or duplicate records.

#### EC-SYN-08 · Data refresh required
- **When:** pull returns `resetRequired: true` because the cursor is behind the tombstone horizon, scope epoch changed, cursor is invalid, or an admin reset was requested.
- **Detected by:** `RESET_REQUIRED` (server, HTTP 409, context `sync`) — runtime check for this case.
- **User sees:** full-screen progress only if no usable mirror exists; otherwise banner. pt-BR: "Vamos atualizar seus dados" / "O que você fez está guardado. O app vai baixar a lista de trabalho de novo." en: "We’ll refresh your data" / "What you did is safe. The app will download your work list again."
- **Recovery:** `AUTO` (wipe mirror tables and pull from 0), `RETRY` (Refresh data), `FALLBACK` (keep working with last usable data until reset starts), `OFFICE`, `HANDOFF`.
- **Data safety:** reset clears pulled cache only after preserving outbox rows, media files, drafts, conflicts and location buffer, then re-runs pending mutators over the fresh base.
- **Office sees:** device reset reason, scope epoch, last pull version and any unresolved rejected actions if a role change caused the reset.
- **Priority / owner:** P0 · T03 · refs OFF-02, OFF-07, OFF-12, A§7.5, A§21 A5.
- **Test:** mobile sync and chaos tests: reset with pending outbox/media/drafts keeps queues, rebuilds cache, resumes push and keeps the user on the same screen where possible.

#### EC-SYN-09 · Item needs review before sending
- **When:** a pushed mutation is rejected with `VALIDATION_FAILED` because an older app sent a payload no longer accepted by the contracts schema, or a `mutationId` is reused with a different user or request hash.
- **Detected by:** `VALIDATION_FAILED` (server, HTTP 422, contexts `schemaUpdate` and `mutationIdReuse`) — runtime check for this case.
- **User sees:** Sync Center conflict sheet. Default/schema update pt-BR: "Atualize para enviar este item" / "O item está salvo. Atualize o AgroRende e tente enviar de novo." en: "Update to send this item" / "The item is saved. Update AgroRende and try sending again." `mutationIdReuse` pt-BR: "Item precisa de revisão" / "O item está salvo. Salve uma cópia e peça revisão antes de reenviar." en: "Item needs review" / "The item is saved. Save a copy and ask for review before sending again."
- **Recovery:** `UPDATE` (store/OTA for schema updates), `FIX` (Salvar cópia for `mutationIdReuse`), `RETRY` (after update or repair), `OFFICE`.
- **Data safety:** rejected mutation stays in `conflicts` with payload and local files until the user retries or the office resolves it; `mutationIdReuse` applies nothing automatically and marks the item as needs review.
- **Office sees:** unresolved rejected mutation in Needs attention with code, context and ref.
- **Priority / owner:** P0 · T03/T02 · refs UX-09, OFF-05, A§7.3, A§7.6, A§21 A1.
- **Test:** chaos T12: old payload returns `VALIDATION_FAILED.schemaUpdate`; reused mutation id with a different hash returns `VALIDATION_FAILED.mutationIdReuse`, shows Salvar cópia, keeps data, and never applies the duplicate intent.

#### EC-SYN-10 · New data did not arrive yet
- **When:** push is done but pull fails, pages time out, or hasMore loop cannot finish.
- **Detected by:** `PULL_FAILED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Novidades ainda não chegaram" / "Seus dados enviados estão seguros. Você pode continuar com a última cópia salva." en: "New data has not arrived yet" / "Your sent data is safe. You can keep working with the last saved copy."
- **Recovery:** `AUTO` (retry pull), `RETRY` (Sync now), `FALLBACK` (last known data with timestamp).
- **Data safety:** confirmed pushes stay applied; local mirror is not partially advanced unless a pull page transaction commits.
- **Office sees:** pushed changes are visible; device last pull remains stale.
- **Priority / owner:** P0 · T03 · refs PLT-09, OFF-07, A§7.5.
- **Test:** mobile sync unit + chaos T12: fail page 2 of pull, assert cursor unchanged for failed page and last-known-data banner includes timestamp.

#### EC-SYN-11 · First download is large
- **When:** first sync or reset must pull a large scope, such as 5,000 assets plus templates and active work.
- **Detected by:** `FIRST_SYNC_LARGE` (client) — runtime check for this case.
- **User sees:** progress screen. pt-BR: "Baixando dados para trabalhar offline" / "Seus dados locais estão seguros. Mantenha o app aberto; isso pode demorar na primeira vez." en: "Downloading data for offline work" / "Your local data is safe. Keep the app open; this can take a while the first time."
- **Recovery:** `AUTO` (paged pull with progress), `RETRY` (Continue), `FALLBACK` (usable cached data if present).
- **Data safety:** each page applies in one SQLite transaction; interruption resumes from the last committed cursor.
- **Office sees:** device initial sync progress via last pull/version once pushes happen.
- **Priority / owner:** P0 · T03 · refs OFF-07, PRD §13 performance, A§7.5.
- **Test:** chaos T12: interrupt first pull mid-way, assert resume from cursor, no duplicate rows, and clear progress copy.

#### EC-SYN-12 · Local update did not finish
- **When:** a bundled SQLite migration fails or is interrupted after an app update.
- **Detected by:** `LOCAL_MIGRATION_FAILED` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Atualização local não terminou" / "Seus dados estão guardados. Tente de novo; não desinstale o app." en: "Local update did not finish" / "Your data is safe. Try again; do not uninstall the app."
- **Recovery:** `RETRY` (Run update again), `UPDATE` (get fixed app), `DIAG`, `OFFICE`.
- **Data safety:** migration runs in transactions or with a pre-migration copy; pending rows are never deleted.
- **Office sees:** diagnostics if sent; device remains stale otherwise.
- **Priority / owner:** P0 · T03 · refs OFF-12, A§7.1, A§15 C11.
- **Test:** chaos T12 C11: previous-schema DB with 30 outbox rows migrates after interruption; component test shows full-screen recovery and no uninstall advice.

#### EC-SYN-13 · Repair local data
- **When:** SQLite integrity check fails, the schema is unsafe after an update, the app cannot open the user database, or corruption is detected before launch.
- **Detected by:** `LOCAL_DB_REPAIR_REQUIRED` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Precisamos reparar os dados do app" / "Não apague o app. Tente reparar, envie diagnóstico ou salve uma cópia protegida quando ela puder ser lida." en: "We need to repair app data" / "Do not delete the app. Try repair, send diagnostics, or save a protected copy when it can be read."
- **Recovery:** `RETRY` (Repair now), `DIAG`, `HANDOFF` (Salvar cópia protegida only when the pre-repair backup is readable), `OFFICE`.
- **Data safety:** the app copies the DB before attempting repair, never drops tables automatically and keeps media files in the durable folder; protected export is offered only after the backup opens successfully.
- **Office sees:** diagnostics with integrity-check summary and a Needs attention item if pending work was exported or cannot be recovered.
- **Priority / owner:** P0 · T03 · refs OFF-02, OFF-12, REC-11.
- **Test:** chaos test: corrupted fixture DB shows safe-copy repair; Salvar cópia protegida appears only for a readable pre-repair backup, and no media or queued item is silently deleted.

#### EC-SYN-14 · Camera did not save
- **When:** camera/video/audio capture returns no file, write fails before durable move, or thumbnail generation crashes during capture.
- **Detected by:** `MEDIA_CAPTURE_FAILED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Não consegui gravar agora" / "Seu formulário está guardado. Tente de novo ou escolha um arquivo da galeria." en: "Could not save capture" / "Your form is safe. Try again or choose a file from the gallery."
- **Recovery:** `RETRY` (Try again), `ALT` (Choose from gallery, typed note), `DRAFT`.
- **Data safety:** wizard draft remains autosaved; no media row is created until the file is durable.
- **Office sees:** nothing unless the user sends diagnostics.
- **Priority / owner:** P0 · T03 · refs FR-03, WO-07, RN-04, A§7.7.
- **Test:** component test for `MediaCapture`: camera returns missing URI → sheet with gallery alternative; chaos T12 asserts no orphan `media_files` row.

#### EC-SYN-15 · Not enough room to record
- **When:** free storage is under 1 GB before video capture or under 200 MB before any capture, or recording stops because storage fills.
- **Detected by:** `MEDIA_DEVICE_STORAGE_LOW` (client) — runtime check for this case.
- **User sees:** full screen or sheet. pt-BR: "Sem espaço para gravar" / "Seu formulário está guardado. Libere espaço ou continue com fotos já salvas." en: "No room to record" / "Your form is safe. Free up space or continue with already saved photos."
- **Recovery:** `SETTINGS` (open storage settings), `ALT` (use existing photo, skip video where allowed), `DRAFT`.
- **Data safety:** existing draft and completed files stay; partial recording is discarded only if it was never committed as evidence.
- **Office sees:** device health free storage warning on next push.
- **Priority / owner:** P0 · T03 · refs OFF-08, OFF-10, A§7.10.
- **Test:** chaos T12 C12: below 1 GB blocks video, below 200 MB blocks all capture, copy states data safe and no draft loss.

#### EC-SYN-16 · Video is too long
- **When:** a captured or gallery video exceeds 60 s or the configured local size limit before upload.
- **Detected by:** `VIDEO_TOO_LONG` (client) — runtime check for this case.
- **User sees:** inline/sheet at evidence picker. pt-BR: "Vídeo longo demais" / "Seu formulário está guardado. Grave até 60 segundos ou mande fotos." en: "Video is too long" / "Your form is safe. Record up to 60 seconds or send photos."
- **Recovery:** `FIX` (trim/record shorter), `ALT` (send photos), `DRAFT`.
- **Data safety:** form data remains; the oversized local file is not enqueued unless the user chooses a valid alternative.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T03 · refs FR-03, OFF-08, A§7.7.
- **Test:** component + chaos T12: 61 s video shows inline guidance, keeps the draft, and unit test refuses enqueue.

#### EC-SYN-17 · File left the device
- **When:** a queued media file's `localUri` no longer exists, often after cleaner apps, gallery moves, or manual deletion.
- **Detected by:** `LOCAL_MEDIA_MISSING` (client) — runtime check for this case.
- **User sees:** Sync Center sheet. pt-BR: "Arquivo saiu do aparelho" / "Seu relato está guardado. Escolha o arquivo de novo ou remova só este anexo." en: "File left the device" / "Your report is safe. Choose the file again or remove only this attachment."
- **Recovery:** `ALT` (Choose again, Record again), `FIX` (Remove this attachment if allowed), `OFFICE`.
- **Data safety:** parent form/report stays; only that media item cannot be uploaded until replaced or removed.
- **Office sees:** media pending/stuck if the parent already reached the office; Needs attention after 24 h.
- **Priority / owner:** P0 · T03 · refs OFF-02, A§7.7.
- **Test:** chaos T12: delete queued local file after parent APPLIED, assert Sync Center replacement flow and parent record remains.

#### EC-SYN-18 · File cannot be opened
- **When:** local file exists but cannot be decoded, size is zero, checksum changes unexpectedly, or video poster extraction fails because the file is corrupt.
- **Detected by:** `LOCAL_MEDIA_CORRUPT` (client) — runtime check for this case.
- **User sees:** Sync Center sheet. pt-BR: "Arquivo não abre" / "Seu relato está guardado. Grave outra vez ou escolha outro arquivo." en: "File will not open" / "Your report is safe. Record again or choose another file."
- **Recovery:** `ALT` (Record again, Choose another), `FIX` (Remove this attachment), `DRAFT`.
- **Data safety:** parent mutation remains queued/applied; corrupt media is isolated as FAILED until replaced or dismissed.
- **Office sees:** pending media missing original; Needs attention after 24 h if parent is already visible.
- **Priority / owner:** P0 · T03 · refs A§7.7, OFF-02.
- **Test:** chaos T12: zero-byte and bad magic local files show recovery without deleting parent or other attachments.

#### EC-SYN-19 · File sending was interrupted
- **When:** app process dies, radio drops, request aborts, or multipart upload stops after some parts are stored.
- **Detected by:** `UPLOAD_INTERRUPTED` (client) — runtime check for this case.
- **User sees:** media queue row. pt-BR: "Envio do arquivo pausado" / "O arquivo está guardado no aparelho. Vamos continuar do ponto em que parou." en: "File sending paused" / "The file is safe on this device. We’ll continue from where it stopped."
- **Recovery:** `AUTO` (resume from recorded parts), `RETRY` (Try now), `FALLBACK` (keep working).
- **Data safety:** `partsDone`, `bytesSent`, and local file remain durable; completed parts are not resent unless their ETag is missing.
- **Office sees:** media stays PENDING until complete; pending bytes on device page.
- **Priority / owner:** P0 · T03 · refs OFF-03, A§7.7, A§15 C1/C3.
- **Test:** chaos T12 C1/C3: kill engine mid-push/upload and drop at part 9 of 15; assert resume with fresh URLs and one final media row.

#### EC-SYN-20 · Upload link expired
- **When:** the local media driver returns an expired upload URL response, or a Phase 2 S3 upload returns `403 Request has expired` while the background upload was waiting.
- **Detected by:** `UPLOAD_URL_EXPIRED` (server, new, HTTP 410) — local driver uses the AgroRende error envelope; the client maps Phase 2 S3 expired 403s to the same code.
- **User sees:** hidden auto state; only row detail if repeated. pt-BR: "Envio demorou demais" / "O arquivo está guardado. O app vai pedir um novo caminho e continuar." en: "Sending took too long" / "The file is safe. The app will ask for a new path and continue."
- **Recovery:** `AUTO` (request fresh URL), `RETRY` (Try now).
- **Data safety:** local file and completed part list remain; no duplicate media rows are created.
- **Office sees:** nothing unless it remains pending over 24 h.
- **Priority / owner:** P0 · T03/T02 · refs A§7.7 signed URLs, A§11 media, O28.
- **Test:** T02 local-driver route test for expired upload token returns 410 with the AgroRende envelope; chaos T12 maps an S3 `403 Request has expired` to `UPLOAD_URL_EXPIRED`, fetches a fresh URL and resumes without user action.

#### EC-SYN-21 · File is too large to send
- **When:** blob route or complete returns `MEDIA_TOO_LARGE` (413), or server-side max bytes claim is exceeded.
- **Detected by:** `MEDIA_TOO_LARGE` (server, HTTP 413) — runtime check for this case.
- **User sees:** Sync Center sheet. pt-BR: "Arquivo grande demais" / "Seu relato está guardado. Grave um vídeo menor ou mande fotos." en: "File is too large" / "Your report is safe. Record a smaller video or send photos."
- **Recovery:** `FIX` (Record/trim smaller), `ALT` (send photos), `OFFICE`.
- **Data safety:** parent row and other media stay queued/sent; oversized media stays FAILED until replaced or removed.
- **Office sees:** pending/failed attachment on Needs attention if parent is already visible.
- **Priority / owner:** P0 · T03 · refs A§7.7, A§8, A§11.
- **Test:** T02 media route test enforces 413; chaos T12 tries a >max video and asserts no parent data loss and replacement flow.

#### EC-SYN-22 · Storage for files is full
- **When:** local `MediaStore` returns `STORAGE_FULL` (507) while writing a blob, part, temp file, or complete output.
- **Detected by:** `STORAGE_FULL` (server, HTTP 507) — runtime check for this case.
- **User sees:** Sync Center banner. pt-BR: "Envio de arquivos pausado" / "Seus arquivos estão guardados no aparelho. Vamos tentar de novo quando houver espaço." en: "File sending paused" / "Your files are safe on this device. We’ll try again when there is room."
- **Recovery:** `AUTO` (retry with long backoff), `RETRY` (Try now), `OFFICE`.
- **Data safety:** media remains queued locally; server partials are cleaned by worker only after safe age.
- **Office sees:** operations alert/health check for media storage; media remains PENDING. `GET /health` reports `media: false` when `MEDIA_ROOT` is not writable but keeps HTTP 200 while the database is up, so operators check the disk (T13 runbook).
- **Priority / owner:** P0 · T03 · refs A§7.7, A§8, A§10, A§11.
- **Test:** T02 storage test forces 507; chaos T12 confirms retryable queue state and no FAILED status.

#### EC-SYN-23 · File format does not match
- **When:** `POST /media/:id/complete` magic-byte or MIME verification fails for image/video/audio/signature.
- **Detected by:** `MEDIA_TYPE_MISMATCH` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** Sync Center sheet. pt-BR: "Formato do arquivo não combina" / "Seu relato está guardado. Escolha outro arquivo ou grave de novo." en: "File format does not match" / "Your report is safe. Choose another file or record again."
- **Recovery:** `ALT` (Choose/record another), `FIX` (Remove this attachment), `OFFICE`.
- **Data safety:** parent data and other files remain; bad media is marked FAILED and kept until user decides.
- **Office sees:** failed media item with ref if parent exists; Needs attention after 24 h.
- **Priority / owner:** P0 · T03 · refs A§7.7 complete, A§11 media validation.
- **Test:** T02 route test uploads JPEG bytes declared as PNG/video and returns 422; chaos T12 asserts user can replace without losing parent.

#### EC-SYN-24 · A piece of the file is missing
- **When:** multipart complete references missing part numbers or an ETag mismatch.
- **Detected by:** `MEDIA_PART_MISSING` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** media queue row. pt-BR: "Faltou um pedaço do arquivo" / "O arquivo está guardado. Vamos reenviar só a parte que faltou." en: "A piece of the file is missing" / "The file is safe. We’ll resend only the missing part."
- **Recovery:** `AUTO` (request missing part URLs), `RETRY` (Try now).
- **Data safety:** original local file stays intact; client recalculates missing parts from local state.
- **Office sees:** media remains PENDING; no duplicate attachment.
- **Priority / owner:** P0 · T03 · refs A§7.7 multipart upload.
- **Test:** T02 complete test omits part 3 and returns 409; chaos T12 asserts client marks part missing and resumes from that part.

#### EC-SYN-25 · Video is waiting for Wi‑Fi
- **When:** `wifiOnlyVideo` is enabled and one or more videos have waited longer than 24 h without Wi‑Fi.
- **Detected by:** `WIFI_ONLY_MEDIA_WAITING` (client) — runtime check for this case.
- **User sees:** Sync Center banner. pt-BR: "Vídeo esperando Wi‑Fi" / "Seu relato já está guardado. Use Wi‑Fi ou libere dados móveis só para este envio." en: "Video waiting for Wi‑Fi" / "Your report is already safe. Use Wi‑Fi or allow mobile data just for this upload."
- **Recovery:** `ALT` (Allow mobile data once, Turn off Wi‑Fi only), `RETRY` (Try now), `OFFICE`.
- **Data safety:** video file remains local and queued; parent record can already be sent with thumbnails/metadata.
- **Office sees:** pending bytes and PENDING media; Needs attention after 24 h.
- **Priority / owner:** P0 · T03 · refs PLT-09, OFF-08, A§7.7.
- **Test:** component test for Sync Center setting; chaos T12 advances clock 24 h with Wi‑Fi-only video and asserts prompt plus one-time mobile-data override.

#### EC-SYN-26 · Preview did not appear
- **When:** thumbnail/poster generation fails locally or thumbnail upload fails while original remains valid.
- **Detected by:** `THUMBNAIL_FAILED` (client) — runtime check for this case.
- **User sees:** small media row warning. pt-BR: "Prévia não apareceu" / "O arquivo original está guardado. Vamos tentar criar a prévia de novo." en: "Preview did not appear" / "The original file is safe. We’ll try to create the preview again."
- **Recovery:** `AUTO` (regenerate/retry thumbnail), `RETRY` (Try now), `FALLBACK` (show file icon).
- **Data safety:** original upload is independent; a missing preview never blocks parent submission.
- **Office sees:** generic placeholder until thumbnail arrives; original is available when complete.
- **Priority / owner:** P0 · T03 · refs OFF-08, A§7.7.
- **Test:** unit test thumbnail generator failure; chaos T12 asserts original upload continues and UI uses placeholder with retry.

#### EC-SYN-27 · Attachment pending too long
- **When:** a server Media row is `PENDING` for more than 24 h after its parent mutation was applied.
- **Detected by:** `MEDIA_PENDING_STALE` (client) — runtime check for this case.
- **User sees:** Sync Center card. pt-BR: "Anexo parado há mais de um dia" / "Seu relato está guardado. Tente reenviar; se continuar, a central verá o pedido de ajuda." en: "Attachment stuck for over a day" / "Your report is safe. Try sending again; if it continues, the office will see the help request."
- **Recovery:** `RETRY` (Retry upload), `DIAG`, `HANDOFF`, `OFFICE`.
- **Data safety:** parent record remains; media file stays local until sent, replaced, or explicitly removed.
- **Office sees:** Needs attention queue item with parent, user, device, pending age, bytes and last error.
- **Priority / owner:** P0 · T03 · refs REC-09, A§7.7, A§10 media.cleanupPending.
- **Test:** chaos T12 + worker test: age PENDING media past 24 h, assert office attention item and field Sync Center recovery; not marked FAILED before 30 days.

#### EC-SYN-28 · Too many saved locations
- **When:** `location_buffer` approaches its max row/size limit after days on duty without connectivity.
- **Detected by:** `LOCATION_BUFFER_TRIMMED` (client) — runtime check for this case.
- **User sees:** duty banner. pt-BR: "Muitas posições guardadas" / "Seu trabalho está seguro. O app mantém as posições mais recentes e avisa a central se faltar trecho." en: "Many locations saved" / "Your work is safe. The app keeps the most recent locations and tells the office if a section is missing."
- **Recovery:** `AUTO` (flush/compress/trim oldest low-value fixes), `HANDOFF` (office sees gap), `FALLBACK`.
- **Data safety:** work records are unaffected; location trail may be summarized but never blocks field work. When the realtime gateway rejects a `location:batch` (validation failure, device not ON_DUTY or a database error) it nacks with `{ ok: false, code }`; the device keeps those fixes in `location_buffer` and sends them through the REST fallback (recovery `AUTO`, no user message), so only repeated rejections can grow the buffer toward this limit.
- **Office sees:** trail gap marker and device alert; no false live position.
- **Priority / owner:** P0 · T03 · refs OFF-09, A§7.8, A§7.10.
- **Test:** chaos T12: fill location buffer beyond limit, assert bounded storage, newer fixes kept, office gap marker emitted, and duty stays usable.

#### EC-SYN-29 · Nothing sent for a day
- **When:** a device has pending mutations/uploads or is ON_DUTY but `lastSyncAt` or `oldestPendingAt` is older than 24 h.
- **Detected by:** `DEVICE_UNSYNCED_STALE` (client) — client and worker.
- **User sees:** Home/Sync Center banner. pt-BR: "Nada enviado há mais de um dia" / "Seus dados estão guardados neste aparelho. Tente enviar agora ou mande um diagnóstico." en: "Nothing sent for a day" / "Your data is safe on this device. Try sending now or send diagnostics."
- **Recovery:** `RETRY` (Sync now), `DIAG`, `OFFICE`.
- **Data safety:** local queues are retained; office alert does not delete or override device data.
- **Office sees:** Ops alert and Team → Devices row with last sync, pending counts, app version and battery.
- **Priority / owner:** P0 · T03 · refs OFF-11, OPS-05, A§7.10, A§10 devices.staleSync.
- **Test:** worker test ages a pending device over 24 h; component test shows banner; chaos T12 asserts Sync now and diagnostics actions.

#### EC-SYN-30 · Sending continues after restart
- **When:** the app is killed, the phone restarts, or OS reclaims memory during an upload or push.
- **Detected by:** `UPLOAD_RESUME_AFTER_RESTART` (client) — runtime check for this case.
- **User sees:** Sync Center info row. pt-BR: "Envio continua ao reabrir" / "O arquivo está guardado. Ao abrir o app, ele continua de onde parou." en: "Sending continues after restart" / "The file is safe. When you reopen the app, it continues from where it stopped."
- **Recovery:** `AUTO` (resume on launch), `RETRY` (Sync now).
- **Data safety:** SQLite queue, media durable folder and multipart state survive process death and phone restart.
- **Office sees:** no duplicate records; media remains PENDING until complete.
- **Priority / owner:** P0 · T03 · refs OFF-02, OFF-03, A§7.7, A§15 C1.
- **Test:** chaos T12 C1: close DB/engine mid-upload, recreate engine, assert one report, all media complete, and resume copy.

#### EC-SYN-31 · Data is on another device
- **When:** the same user has pending data on another registered device, or office sees stale pending counts for a different installation.
- **Detected by:** `SAME_USER_MULTIPLE_DEVICES` (client) — client/server route.
- **User sees:** Sync Center info card. pt-BR: "Há dados em outro aparelho" / "Os dados deste aparelho estão guardados. Abra o outro aparelho para enviar o que ficou lá." en: "There is data on another device" / "The data on this device is safe. Open the other device to send what is there."
- **Recovery:** `ALT` (open/use other device), `OFFICE`, `FALLBACK` (this device keeps working).
- **Data safety:** per-device mutation ids and per-user DBs keep queues separate; this device never pulls another device's unsent local data.
- **Office sees:** Team → Devices lists each device separately with pending counts and last sync.
- **Priority / owner:** P0 · T03 · refs PLT-12, OFF-02, OFF-11, A§7.1, A§8 Devices.
- **Test:** chaos T12: two devices for one user create pending work; assert each queue drains independently and Sync Center names the other stale device without exposing its contents.

#### EC-SYN-32 · Media is locked by another action
- **When:** the user tries to replace, delete or re-parent a media item while an upload, PDF, report, WO or rental transaction has already locked it for audit.
- **Detected by:** `MEDIA_LOCKED` (server, HTTP 409) — media mutation guard.
- **User sees:** Sync Center sheet. pt-BR: "Arquivo já está protegido" / "O anexo original continua salvo. Veja o item enviado ou peça revisão à central." en: "File is already protected" / "The original attachment stays saved. View the sent item or ask the office to review it."
- **Recovery:** `FALLBACK` (View sent item/read-only), `OFFICE`.
- **Data safety:** the locked media, parent record and audit trail remain unchanged; no replacement is guessed or partially applied.
- **Office sees:** blocked media mutation ref with parent item and actor.
- **Priority / owner:** P0 · T03/T02 · refs A§7.7 Media, A§11, A§21.
- **Test:** media route test: replacing a locked attachment returns `MEDIA_LOCKED`; mobile keeps the original row visible and offers only read-only view/office review.

#### EC-SYN-33 · Original media still sending
- **When:** a user opens or shares a media original whose thumbnail/poster exists but whose original variant is not uploaded yet, or the storage driver cannot find the requested variant.
- **Detected by:** `MEDIA_NOT_IN_STORAGE` (server, HTTP 404) — media URL/variant lookup.
- **User sees:** Sync Center sheet or inline media viewer. pt-BR: "Vídeo original ainda enviando" / "O vídeo original ainda está sendo enviado. Mostramos a prévia e avisamos quando terminar." en: "Original video is still uploading" / "The original video is still being sent. We show the preview and let you know when it finishes."
- **Recovery:** `FALLBACK` (show thumbnail/poster), `DIAG`, `OFFICE`.
- **Data safety:** the parent report, WO or rental remains saved; the missing variant is not marked lost while upload is pending.
- **Office sees:** media variant status and pending bytes on the device/media detail.
- **Priority / owner:** P0 · T03/T02 · refs A§7.7, A§21 A10.
- **Test:** media URL test: requesting a not-yet-uploaded original returns `MEDIA_NOT_IN_STORAGE`; UI shows the thumbnail/poster and copy "O vídeo original ainda está sendo enviado" without deleting the attachment.

#### EC-SYN-34 · Step no longer valid
- **When:** an offline mutation reaches the server after the target item moved to a state where that transition is no longer allowed.
- **Detected by:** `INVALID_TRANSITION` (server, HTTP 409) — workflow transition guard for WO/rental/report state machines.
- **User sees:** banner. pt-BR: "Etapa não vale mais" / "Seu trabalho ficou salvo. Veja o estado atual e tente o próximo passo disponível." en: "Step is no longer valid" / "Your work stayed saved. Review the current state and try the next available step."
- **Recovery:** `FALLBACK` (View latest state), `RETRY` (after refresh).
- **Data safety:** evidence and notes in the rejected mutation remain in the conflict record; no state is overwritten.
- **Office sees:** Needs attention conflict with attempted transition, current state and request ref when it cannot auto-resolve.
- **Priority / owner:** P0 · T03/T07/T08/T02 · refs A§6, A§7.3, A§21.
- **Test:** transition tests: stale WO and rental actions return `INVALID_TRANSITION`, keep attached evidence, refresh the current state and do not duplicate timeline events.

#### EC-SYN-35 · App action not recognized
- **When:** an old or corrupted app sends a mutation name the server does not know.
- **Detected by:** `UNKNOWN_MUTATION` (server, HTTP 422) — sync push mutation dispatcher.
- **User sees:** Sync Center conflict sheet. pt-BR: "Atualize para enviar esta ação" / "A ação ficou salva. Atualize o AgroRende e envie um diagnóstico se continuar." en: "Update to send this action" / "The action stayed saved. Update AgroRende and send diagnostics if it continues."
- **Recovery:** `UPDATE`, `DIAG`, `OFFICE`.
- **Data safety:** the unknown mutation is not applied or discarded; payload and local files stay in the conflict record for review.
- **Office sees:** Needs attention item with mutation name, app version, device and ref.
- **Priority / owner:** P0 · T03/T02/T12 · refs A§7.3, A§21.
- **Test:** sync push test: unknown mutation returns `UNKNOWN_MUTATION`, keeps the outbox/conflict payload and surfaces update + diagnostics copy.

## 6. Field reports (EC-FR)

#### EC-FR-01 · Machine not found
- **When:** the reporter scans or searches from the Machine step and the asset is not in the local org data.
- **Detected by:** `REPORT_MACHINE_NOT_FOUND` (client) — runtime check for this case.
- **User sees:** inline + sheet. pt-BR: "Não encontrei essa máquina" / "Seu rascunho está salvo. Busque pelo código ou registre como máquina não cadastrada." en: "Machine not found" / "Your draft is saved. Search by code or report it as an unregistered machine."
- **Recovery:** `ALT` (Search by code, Machine not registered), `OFFICE`.
- **Data safety:** draft fields stay saved on the device; no report is sent until the user chooses a machine path.
- **Office sees:** nothing until submit; if submitted as unregistered, the triage inbox shows the plate photo and free text.
- **Priority / owner:** P0 · T06 · refs FR-02, PLT-05, A§13.3; coordinate copy with EC-PLT asset lookup.
- **Test:** component test: unknown scan/search result keeps draft and shows Search + Machine not registered actions.

#### EC-FR-02 · Plate photo missing
- **When:** the reporter chooses Machine not registered but tries to continue without free text or a plate/photo.
- **Detected by:** `REPORT_UNREGISTERED_MACHINE_INCOMPLETE` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Falta identificar a máquina" / "Seu rascunho está salvo. Escreva o que souber e tire uma foto da placa ou do chassi." en: "Machine details needed" / "Your draft is saved. Add what you know and take a photo of the plate or chassis."
- **Recovery:** `FIX` (focus missing field or plate photo), `DRAFT`.
- **Data safety:** the unregistered-machine draft and any evidence already captured are kept.
- **Office sees:** nothing until submit.
- **Priority / owner:** P0 · T06 · refs FR-02, A§13.3.
- **Test:** wizard validation test: unregistered path blocks Next, focuses the missing field and preserves entered text.

#### EC-FR-03 · Different machine scanned
- **When:** a report draft already has a machine and the user scans another QR before submit.
- **Detected by:** `REPORT_MACHINE_CHANGED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Esta é outra máquina" / "Seu rascunho está salvo. Troque a máquina do relato ou mantenha a anterior." en: "This is a different machine" / "Your draft is saved. Change the report machine or keep the previous one."
- **Recovery:** `ALT` (Use scanned machine, Keep previous), `DRAFT`.
- **Data safety:** all evidence remains in the draft; if the user switches, the review step asks them to confirm the evidence belongs to the new machine.
- **Office sees:** nothing until submit.
- **Priority / owner:** P0 · T06 · refs FR-02, A§13.3; QR-not-readable cases stay with EC-PLT.
- **Test:** component test: second scan opens choice sheet and keeps media after either choice.

#### EC-FR-04 · Machine needs office attention
- **When:** the selected asset is retired, rented out, already in repair, unknown or outside the offline scope while the reporter is creating a field report.
- **Detected by:** `REPORT_ASSET_ATTENTION` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Vamos receber o relato com aviso" / "Seu rascunho está salvo. O relato será aceito e a central verá a situação da máquina." en: "We will receive the report with a note" / "Your draft is saved. The report will be accepted and the office will see the machine status."
- **Recovery:** `ALT` (Continue as unregistered when needed), `HANDOFF` (office reviews the flag), `OFFICE`.
- **Data safety:** field reports are never rejected for asset state; retired/rented/in-repair assets are accepted with flags or links, and unknown/other-org machines are stored as unregistered.
- **Office sees:** triage badge for retired, rented out, already in repair or unregistered machine, plus link to the rental/open WO when one exists.
- **Priority / owner:** P0 · T06 · refs FR-02, OFF-05, REC-01, G3.2.
- **Test:** sync test: reports for retired, rented, in-repair and unknown assets are accepted with the expected flags; only schema validation can reject.

#### EC-FR-05 · Add at least one photo or video
- **When:** the Evidence or Review step has no non-deleted photo or video.
- **Detected by:** `REPORT_EVIDENCE_REQUIRED` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Falta uma foto ou vídeo" / "Seu relato está salvo. Adicione uma foto ou vídeo do problema para enviar." en: "Photo or video needed" / "Your report is saved. Add a photo or video of the problem to send it."
- **Recovery:** `FIX` (open Evidence step), `DRAFT`.
- **Data safety:** title, details, voice notes and machine selection remain saved.
- **Office sees:** nothing until submit.
- **Priority / owner:** P0 · T06 · refs FR-03, A§13.3.
- **Test:** wizard test: Submit disabled without photo/video and focuses Evidence.

#### EC-FR-06 · Too many videos
- **When:** the user adds a sixth video to a field report.
- **Detected by:** `REPORT_VIDEO_LIMIT_EXCEEDED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Limite de vídeos atingido" / "Seu relato está salvo. Apague um vídeo ou tire fotos do restante." en: "Video limit reached" / "Your report is saved. Delete a video or use photos for the rest."
- **Recovery:** `FIX` (Delete a video), `ALT` (Take photos instead), `UNDO`.
- **Data safety:** existing videos stay attached; deleted videos show Undo for 10 seconds and then Recently deleted for 7 days.
- **Office sees:** nothing until submit.
- **Priority / owner:** P0 · T06 · refs FR-03, REC-06, A§13.3.
- **Test:** component test: sixth video is blocked, delete offers Undo, report still has five videos.

#### EC-FR-07 · Voice note not recorded
- **When:** voice recording fails in the Evidence or Details step after the microphone was available.
- **Detected by:** `VOICE_NOTE_FAILED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Não gravei o áudio" / "Seu relato está salvo. Tente gravar de novo ou escreva a observação." en: "Audio was not recorded" / "Your report is saved. Try recording again or type the note."
- **Recovery:** `RETRY` (Record again), `ALT` (Type note), `SETTINGS`.
- **Data safety:** all previous evidence remains saved; a failed audio clip is not attached.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T06 · refs FR-03, FR-05, REC-10.
- **Test:** component test: recorder failure opens recovery sheet with retry and typed-note path.

#### EC-FR-08 · Gallery item missing date or place
- **When:** a gallery photo/video lacks capture time, location, or both.
- **Detected by:** `REPORT_MEDIA_METADATA_MISSING` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Falta data ou local nessa mídia" / "Seu relato está salvo. Use a data/local de agora ou tire uma nova foto." en: "This media is missing date or place" / "Your report is saved. Use the current date/place or take a new photo."
- **Recovery:** `ALT` (Use current date/place, Retake), `FIX`.
- **Data safety:** the selected gallery item is kept in the draft until the user chooses or removes it.
- **Office sees:** submitted media is flagged `metadataFromDevice=true` in the report gallery.
- **Priority / owner:** P0 · T06 · refs FR-03, A§7.3 `MediaMeta`.
- **Test:** unit test: EXIF-less gallery item asks for a choice and records the chosen metadata source.

#### EC-FR-09 · Details still incomplete
- **When:** category, severity, operable, suggested action or title is missing or invalid on Details/Review.
- **Detected by:** `REPORT_DETAILS_INCOMPLETE` (client) — runtime check for this case.
- **User sees:** inline + summary. pt-BR: "Complete os detalhes do relato" / "Seu rascunho está salvo. Escolha a categoria e preencha os campos destacados." en: "Complete the report details" / "Your draft is saved. Choose a category and fill the highlighted fields."
- **Recovery:** `FIX` (focus first invalid field), `DRAFT`.
- **Data safety:** all evidence and text remain saved.
- **Office sees:** nothing unless an old app sends invalid data; then Needs attention shows `VALIDATION_FAILED`.
- **Priority / owner:** P0 · T06 · refs FR-05, REC-13.
- **Test:** schema/UI test: each missing field shows one inline example and preserves all inputs.

#### EC-FR-10 · Location is weak or unavailable
- **When:** the report location is missing or accuracy is worse than the configured threshold.
- **Detected by:** `REPORT_LOCATION_WEAK` (client) — runtime check for this case.
- **User sees:** banner on Location/Review. pt-BR: "Localização pouco precisa" / "Seu relato está salvo. Escolha a fazenda ou continue com local aproximado." en: "Location is not precise" / "Your report is saved. Pick the farm or continue with an approximate place."
- **Recovery:** `ALT` (Pick site, Use approximate place), `SETTINGS`, `OFFICE`.
- **Data safety:** the report can be submitted with the selected site or approximate coordinates; the accuracy is shown to the office.
- **Office sees:** report map badge `approximate location` with accuracy meters and whether the site was user-selected.
- **Priority / owner:** P0 · T06 · refs FR-06, REC-10, A§7.8.
- **Test:** component test: location timeout shows banner, keeps Submit available through the alternate path.

#### EC-FR-11 · No plots for this farm
- **When:** the selected farm has no plots in the local data or the plot list is stale/empty.
- **Detected by:** `REPORT_NO_PLOTS_AVAILABLE` (client) — runtime check for this case.
- **User sees:** inline empty state. pt-BR: "Sem talhões cadastrados aqui" / "Seu relato está salvo. Continue sem talhão ou escolha outro local." en: "No plots registered here" / "Your report is saved. Continue without a plot or choose another site."
- **Recovery:** `FALLBACK` (Continue without plot), `FIX` (Choose another site).
- **Data safety:** report remains valid with `plotId` empty.
- **Office sees:** report has site only; triage can add a plot later when one exists.
- **Priority / owner:** P0 · T06 · refs FR-02, OFF-07.
- **Test:** component test: farm with empty plots shows non-blocking empty state and allows Next.

#### EC-FR-12 · Draft recovered after interruption
- **When:** the app is killed, the phone rings, or the OS reclaims memory during the report wizard.
- **Detected by:** `REPORT_DRAFT_RESTORED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Relato recuperado" / "Está tudo salvo. Continue de onde parou ou revise antes de enviar." en: "Report recovered" / "Everything is saved. Continue where you stopped or review before sending."
- **Recovery:** `DRAFT` (Continue draft), `ALT` (Review from start), `UNDO` (Discard draft).
- **Data safety:** autosaved fields and durable media are restored from the draft store.
- **Office sees:** nothing until submit.
- **Priority / owner:** P0 · T06 · refs FR-07, REC-11, A§13.3.
- **Test:** integration test: kill/reopen at each step restores the same step and media thumbnails.

#### EC-FR-13 · Critical issue on a busy asset
- **When:** a Critical or not-operable report is created for an asset that is currently rented out or already in repair.
- **Detected by:** `REPORT_ASSET_BUSY` (client) — server route-applied report context and client status banner.
- **User sees:** banner after send/apply. pt-BR: "A central vai tratar com prioridade" / "Seu relato foi salvo. A máquina já está em locação ou reparo, e a central foi avisada." en: "The office will handle this first" / "Your report is saved. The machine is already rented or in repair, and the office was notified."
- **Recovery:** `HANDOFF` (Office will review), `OFFICE`.
- **Data safety:** the report, rental/WO link and evidence are kept; no duplicate WO is created automatically.
- **Office sees:** urgent report linked to the active rental or open WO, with an alert to decide whether to attach, create a new WO or contact the customer.
- **Priority / owner:** P0 · T06 · refs BR-F1-1, BR-F1-3, RN-05, A§6.4.
- **Test:** service test: critical report on rented/in-repair asset links context and creates one urgent notification without changing retired/manual states.

#### EC-FR-14 · Report marked for repair
- **When:** the office marks the reporter's submitted report for repair.
- **Detected by:** `REPORT_MARKED_FOR_REPAIR_STATUS` (client) — runtime check for this case.
- **User sees:** notification + report status. pt-BR: "Relato virou ordem de serviço" / "Seu relato está seguro. A central abriu a OS e você pode acompanhar o andamento." en: "Report became a work order" / "Your report is safe. The office opened the job and you can follow its progress."
- **Recovery:** `FALLBACK` (Open linked WO status), `OFFICE`.
- **Data safety:** report evidence is copied/linked to the WO and remains on the report.
- **Office sees:** report status `MARKED_FOR_REPAIR`, linked WO and notification delivery state.
- **Priority / owner:** P0 · T06 · refs FR-10, FR-21, BR-F1-3, A§6.5.
- **Test:** integration test: mark-for-repair updates My reports status and links the WO without hiding evidence.

#### EC-FR-15 · Repair job already open
- **When:** an office user marks a report for repair while the same asset already has an open repair WO.
- **Detected by:** `ASSET_REPAIR_ALREADY_OPEN` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** web dialog. pt-BR: "Já existe uma OS aberta" / "Nada foi perdido. Anexe este relato à OS existente ou crie outra OS com motivo." en: "A job is already open" / "Nothing was lost. Attach this report to the existing job or create another job with a reason."
- **Recovery:** `ALT` (Attach to the existing job), `FIX` (Review report), `HANDOFF` (Create anyway for ADMIN/MANAGER with required reason).
- **Data safety:** the report stays in review and no duplicate WO is created unless an authorized user explicitly creates another with a reason.
- **Office sees:** dialog with the existing WO number, assignee, status, latest activity and ADMIN/MANAGER Create anyway action.
- **Priority / owner:** P0 · T06 · refs FR-21, BR-F1-3, A§6.4.
- **Test:** route test: mark-for-repair on asset with open WO returns `ASSET_REPAIR_ALREADY_OPEN` and offers attach-existing as the primary action.

#### EC-FR-16 · Similar open report found
- **When:** the Machine step detects an open report or WO for the same asset before submit.
- **Detected by:** `REPORT_DUPLICATE_HINT` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Já existe relato para esta máquina" / "Seu rascunho está salvo. Adicione informações ao relato existente ou continue com um novo." en: "There is already a report for this machine" / "Your draft is saved. Add information to the existing report or continue with a new one."
- **Recovery:** `ALT` (Add info to existing, Continue new), `DRAFT`.
- **Data safety:** the draft is kept if the user opens the existing item.
- **Office sees:** if the user continues, triage shows a duplicate hint and link to the open item.
- **Priority / owner:** P1 · T17 · refs FR-12, PLT-10.
- **Test:** Maestro/component test: asset with open report/WO shows duplicate hint and preserves draft on navigation.

#### EC-FR-17 · Report merged as duplicate
- **When:** the office dismisses or merges a submitted report as a duplicate of another report/WO.
- **Detected by:** `REPORT_DUPLICATE_MERGED` (client) — runtime check for this case.
- **User sees:** notification + report status. pt-BR: "Relato juntado a outro" / "Seu relato está seguro. A central aproveitou suas fotos e notas no atendimento existente." en: "Report merged with another" / "Your report is safe. The office used your photos and notes in the existing case."
- **Recovery:** `FALLBACK` (Open existing case), `OFFICE`.
- **Data safety:** media and notes are retained and linked as evidence on the target item.
- **Office sees:** audit trail with source report, target item and merge reason.
- **Priority / owner:** P1 · T06 · refs FR-10, FR-21, PLT-10.
- **Test:** service test: merge/dismiss duplicate notifies reporter and keeps evidence reachable from the target.

#### EC-FR-18 · Report is locked
- **When:** an office user or sync retry tries to edit, merge or mark a report after it was archived, merged, verified or locked by a linked WO/rental decision.
- **Detected by:** `REPORT_LOCKED` (server, HTTP 409) — report mutation guard.
- **User sees:** banner. pt-BR: "Relato já está protegido" / "Seu relato continua salvo. Veja o histórico ou peça revisão à central." en: "Report is already protected" / "Your report stays saved. View the history or ask the office to review it."
- **Recovery:** `FALLBACK` (View history/read-only), `OFFICE`.
- **Data safety:** evidence, notes and audit links remain intact; the rejected edit is not partially applied.
- **Office sees:** blocked report mutation with actor, current status and request ref.
- **Priority / owner:** P0 · T06 · refs FR-10, FR-21, A§6.4, A§21.
- **Test:** report service test: editing or merging a locked report returns `REPORT_LOCKED`, leaves evidence unchanged and shows read-only recovery copy.

## 7. Repair (EC-WO)

#### EC-WO-01 · New job arrived while offline
- **When:** a WO is assigned to a field worker while the device is offline or the app is closed.
- **Detected by:** `WO_ASSIGNED_STALE` (client) — client after pull/push poke.
- **User sees:** banner + job card. pt-BR: "Nova OS recebida" / "A OS está no aparelho. Abra para aceitar ou recusar quando estiver pronto." en: "New job received" / "The job is on this device. Open it to accept or decline when you are ready."
- **Recovery:** `FALLBACK` (Open job from Today), `AUTO`.
- **Data safety:** no field work data exists yet; the assignment is cached for offline use.
- **Office sees:** assignment remains active; last-sync time explains any delay.
- **Priority / owner:** P0 · T07 · refs WO-01, WO-03, OFF-07, A§6.5.
- **Test:** pull test: assigned job appears after offline period with accept/decline actions and no spinner.

#### EC-WO-02 · Decline reason needed
- **When:** the assignee taps Decline without a reason.
- **Detected by:** `WO_DECLINE_REASON_REQUIRED` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Informe o motivo" / "Nada foi enviado ainda. Escolha um motivo rápido ou escreva uma observação curta." en: "Add a reason" / "Nothing was sent yet. Choose a quick reason or write a short note."
- **Recovery:** `FIX` (focus reason), `DRAFT`.
- **Data safety:** the job stays assigned until a valid decline is saved.
- **Office sees:** nothing until the decline is submitted; then timeline shows the reason.
- **Priority / owner:** P0 · T07 · refs WO-04, A§6.2.
- **Test:** component + mutator test: decline without reason blocks locally and server rejects stale clients.

#### EC-WO-03 · Job cancelled while offline
- **When:** the office cancels the WO while the assignee accepted, started, added evidence or completed offline.
- **Detected by:** `WO_CANCELLED` (server, HTTP 409) — runtime check for this case.
- **User sees:** conflict banner. pt-BR: "Esta OS foi cancelada" / "Suas fotos e anotações estão seguras e foram enviadas para a central como evidência." en: "This job was cancelled" / "Your photos and notes are safe and were sent to the office as evidence."
- **Recovery:** `FALLBACK` (View read-only job), `OFFICE`.
- **Data safety:** media, checklist, parts and notes are applied as late evidence; rejected state changes stay in Sync Center until acknowledged.
- **Office sees:** cancelled WO with `hasLateEvidence`, Needs attention item and LATE_EVIDENCE notification.
- **Priority / owner:** P0 · T07 · refs BR-F2-4, A§6.2, A§7.6.
- **Test:** chaos test: complete-after-cancel rejects transition, applies media/checklist as late evidence and shows the banner.

#### EC-WO-04 · Job reassigned while offline
- **When:** the office reassigns the WO to another person while the original assignee works offline.
- **Detected by:** `WO_REASSIGNED` (server, HTTP 409) — runtime check for this case.
- **User sees:** conflict banner. pt-BR: "Esta OS foi para outra pessoa" / "Seu trabalho está salvo e a central foi avisada." en: "This job went to another assignee" / "Your work is saved and the office was notified."
- **Recovery:** `FALLBACK` (View read-only job), `OFFICE`.
- **Data safety:** evidence from the previous assignee is kept as late evidence; no local files are deleted.
- **Office sees:** reassignment timeline, previous assignee evidence and LATE_EVIDENCE alert.
- **Priority / owner:** P0 · T07 · refs BR-F2-4, A§6.2, A§7.6.
- **Test:** push test: previous assignee state change returns `WO_REASSIGNED`; media/addPart/checklist apply.

#### EC-WO-05 · Job changed while offline
- **When:** the office edits destination, instructions, due time, checklist template or priority before the assignee's offline transition is sent.
- **Detected by:** `WO_CHANGED_STALE` (client) — client after pull.
- **User sees:** banner. pt-BR: "A OS foi atualizada" / "Seu progresso está salvo. Revise as mudanças antes do próximo passo." en: "The job was updated" / "Your progress is saved. Review the changes before the next step."
- **Recovery:** `FIX` (Review changes), `FALLBACK`.
- **Data safety:** unsent local evidence remains attached to the job; the newest office fields are highlighted.
- **Office sees:** normal activity timeline; no attention item unless a local action later conflicts.
- **Priority / owner:** P0 · T07 · refs WO-03, WO-04, OFF-05.
- **Test:** integration test: pull with changed fields keeps local draft checklist and highlights changed sections.

#### EC-WO-06 · Navigation app not installed
- **When:** the field worker taps Start route/Navigate and no maps app can open a `geo:`/maps URL.
- **Detected by:** `NAV_APP_MISSING` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Nenhum app de mapas encontrado" / "A OS está salva. Copie as coordenadas ou abra no navegador." en: "No maps app found" / "The job is saved. Copy the coordinates or open them in the browser."
- **Recovery:** `ALT` (Copy coordinates, Open in browser), `OFFICE`.
- **Data safety:** the job transition to En route is kept if it already happened; otherwise the job stays Accepted.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T07 · refs WO-05, A§13.5.
- **Test:** unit/component test: no URL handler → sheet with copy/browser/office actions.

#### EC-WO-07 · Destination missing
- **When:** Start route/Navigate is tapped and the WO has no coordinates and no usable rural address/location note.
- **Detected by:** `WO_DESTINATION_MISSING` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Falta o local da OS" / "A OS está salva. Ligue para o cliente ou peça a localização para a central." en: "Job location missing" / "The job is saved. Call the customer or ask the office for the location."
- **Recovery:** `OFFICE`, `ALT` (Call customer, Use last known asset place).
- **Data safety:** no status change is lost; any chosen fallback is recorded in the timeline.
- **Office sees:** Needs attention on the WO and dispatch form highlights destination.
- **Priority / owner:** P0 · T07 · refs WO-03, WO-05, A§13.5.
- **Test:** route/component test: missing destination blocks navigation and office create/assign warns with recovery actions.

#### EC-WO-08 · Map opened the wrong place
- **When:** the field worker indicates the map destination is wrong or the location note conflicts with the coordinates.
- **Detected by:** `NAV_DESTINATION_DOUBTFUL` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Parece ser o local errado" / "A OS está salva. Use as coordenadas, ligue para o cliente ou avise a central." en: "This may be the wrong place" / "The job is saved. Use the coordinates, call the customer or notify the office."
- **Recovery:** `ALT` (Copy coordinates, Call customer), `OFFICE`.
- **Data safety:** route status and notes stay saved; optional correction note is added to the timeline.
- **Office sees:** attention note with the field worker's correction request and current GPS if available.
- **Priority / owner:** P0 · T07 · refs WO-03, WO-05, A§13.5.
- **Test:** component test: wrong-place action opens recovery sheet and creates a note without changing status.

#### EC-WO-09 · Safety item failed
- **When:** a required safety checklist item is marked Fail before Start work or Complete.
- **Detected by:** `WO_SAFETY_STOP_REQUIRED` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Pare por segurança" / "A OS está salva. Coloque em espera por segurança e avise a central." en: "Stop for safety" / "The job is saved. Put it on hold for safety and notify the office."
- **Recovery:** `ALT` (On hold · safety), `OFFICE` (manager/admin release after review).
- **Data safety:** checklist answers, photos and notes stay saved; the job is not completed until the safety issue is resolved.
- **Office sees:** WO On hold · safety with failed safety item, evidence, notification and manager/admin release control.
- **Priority / owner:** P0 · T07 · refs WO-08, WO-04, A§6.2.
- **Test:** checklist test: failing safety-critical item shows stop-work recovery, sets On hold · safety and only manager/admin release clears it.

#### EC-WO-10 · After photo missing
- **When:** Complete is tapped without at least one non-deleted media item tagged AFTER.
- **Detected by:** `GUARD_AFTER_PHOTO_REQUIRED` (server, HTTP 409) — client/server route.
- **User sees:** inline. pt-BR: "Falta foto depois do reparo" / "A OS está salva. Tire uma foto final da máquina para concluir." en: "After-repair photo needed" / "The job is saved. Take one final photo of the machine to complete it."
- **Recovery:** `FIX` (Open camera with AFTER tag), `DRAFT`.
- **Data safety:** checklist, parts, signature and notes remain saved.
- **Office sees:** nothing until valid completion; if server rejects, Sync Center and Needs attention show the missing guard.
- **Priority / owner:** P0 · T07 · refs WO-07, WO-10, A§6.2, A§7.3.
- **Test:** UI and push tests: Complete opens camera tagged AFTER and `GUARD_AFTER_PHOTO_REQUIRED` recovers in place.

#### EC-WO-11 · Checklist still incomplete
- **When:** Complete is tapped while required checklist items are unanswered or missing required photos.
- **Detected by:** `GUARD_CHECKLIST_INCOMPLETE` (server, HTTP 409) — client/server route.
- **User sees:** inline + summary. pt-BR: "Checklist incompleto" / "A OS está salva. Responda os itens destacados e adicione as fotos pedidas." en: "Checklist incomplete" / "The job is saved. Answer the highlighted items and add the required photos."
- **Recovery:** `FIX` (focus first missing item), `DRAFT`.
- **Data safety:** existing answers and photos stay saved and are merged by newest answer time.
- **Office sees:** nothing until valid completion; stale rejection shows the guard code and snapshot.
- **Priority / owner:** P0 · T07 · refs WO-08, WO-10, A§6.2, A§7.3.
- **Test:** checklist runner test: summary links to first missing required answer/photo and preserves answered items.

#### EC-WO-12 · Customer signature exception
- **When:** the customer is absent, refuses to sign, the signer reason is missing, or the signature pad fails while completing a WO.
- **Detected by:** `WO_SIGNATURE_EXCEPTION` (client) — client/server route.
- **User sees:** sheet. pt-BR: "Assinatura não concluída" / "A OS está salva. Registre ausência ou recusa, tire foto final e conclua sem assinatura." en: "Signature not completed" / "The job is saved. Record absence or refusal, add the final photo and complete without a signature."
- **Recovery:** `RETRY` (Sign again), `FIX` (Open signature), `ALT` (Record absent/refused/other reason and witness), `HANDOFF` (office attention), `OFFICE`.
- **Data safety:** completion details are kept; the WO completes as Completed · no signature when the required reason/evidence is recorded, and the PDF states the reason.
- **Office sees:** Needs attention item, completion timeline, PDF marker `Not signed: <reason>` and any witness name/photo.
- **Priority / owner:** P0 · T07 · refs WO-10, REC-01, REC-07, G3.3.
- **Test:** component + service test: absent/refused/signer-pad-failed paths keep completion data, never fake a signature, create attention and mark the PDF correctly.

#### EC-WO-13 · Waiting for parts
- **When:** the assignee cannot continue because a part is missing or the repair needs ordering.
- **Detected by:** `WO_WAITING_PARTS_HOLD` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Peça indisponível" / "A OS está salva. Coloque em espera por peças e anote o que falta." en: "Part unavailable" / "The job is saved. Put it on hold for parts and note what is missing."
- **Recovery:** `ALT` (On hold · waiting parts), `OFFICE`.
- **Data safety:** work time stops while on hold; notes and partial evidence remain on the WO.
- **Office sees:** ON_HOLD with WAITING_PARTS, note, SLA/work-time calculation excluding hold time.
- **Priority / owner:** P0 · T07 · refs WO-04, WO-09, BR-F2-3.
- **Test:** status test: hold WAITING_PARTS stops work-time clock and shows note to the office.

#### EC-WO-14 · Hour meter needs review
- **When:** completion hour meter is lower than the last known reading or jumps beyond `elapsedHours × 24`.
- **Detected by:** `METER_READING_LOWER` / `METER_READING_JUMP` (server, new, HTTP 409) — client pre-check and server reading guard.
- **User sees:** sheet. pt-BR: "Confira o horímetro" / "A OS está salva. Corrija a leitura, confirme o salto ou marque troca de medidor com foto." en: "Check the hour meter" / "The job is saved. Fix the reading, confirm the jump or mark that the meter was replaced with a photo."
- **Recovery:** `FIX` (Edit reading), `ALT` (Meter was replaced with required photo; Confirm big jump, which resubmits with `confirmMeterJump`), `OFFICE`.
- **Data safety:** completion stays as a draft until the reading is corrected or explicitly explained; master readings are not lowered automatically.
- **Office sees:** activity note for ignored/lowered reading, confirmed jump or meter-replacement flag for review.
- **Priority / owner:** P0 · T07 · refs WO-10, A§6.4 readings are monotonic.
- **Test:** unit/UI test: lower and absurd-jump readings show recovery; meter-replaced path requires photo and preserves completion data.

#### EC-WO-15 · Office already verified it
- **When:** an assignee sends a completion/edit from an old offline view after the office already verified the WO.
- **Detected by:** `WO_ALREADY_VERIFIED` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** conflict banner. pt-BR: "A OS já foi conferida" / "Seu trabalho está salvo como evidência extra. A central vai revisar se precisar." en: "This job was already verified" / "Your work is saved as extra evidence. The office will review it if needed."
- **Recovery:** `FALLBACK` (View verified job), `HANDOFF`, `OFFICE`.
- **Data safety:** evidence and notes sent after verification are accepted as flagged late evidence; the verified state is not overwritten.
- **Office sees:** verified WO with late evidence and Needs attention item.
- **Priority / owner:** P0 · T07 · refs WO-23, BR-F2-4, A§6.2.
- **Test:** push test: completion after VERIFIED keeps media as late evidence, flags the office and does not apply the state change again.

#### EC-WO-16 · Job is for a retired asset
- **When:** an office user creates/assigns a WO or an assignee opens a WO whose asset is now RETIRED.
- **Detected by:** `WO_ASSET_RETIRED` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** banner/dialog. pt-BR: "Máquina aposentada" / "A OS está salva. A central recebeu o pedido de revisão; volte para Hoje enquanto isso." en: "Asset is retired" / "The job is saved. The office received the review request; go back to Today for now."
- **Recovery:** `HANDOFF` (Office review queued), `FALLBACK` (Voltar para Hoje), `OFFICE`.
- **Data safety:** existing WO data is preserved; no automatic asset condition change is made.
- **Office sees:** Needs attention item with retired asset badge and actions to cancel, change asset or reactivate asset separately.
- **Priority / owner:** P0 · T07 · refs BR-F2-1, A§6.4, A§8 work-orders.
- **Test:** service/route test: assign/start on retired asset is blocked with queued-review copy, Voltar para Hoje recovery and no condition recompute override.

#### EC-WO-17 · Same job open for two assignees
- **When:** two people have the same WO visible because of reassignment timing, shared device state or stale pull scope.
- **Detected by:** `WO_CONCURRENT_TECHNICIAN` (client) — client after pull.
- **User sees:** banner. pt-BR: "Outra pessoa também está nesta OS" / "Seu trabalho está salvo. Volte para Hoje ou continue só com fotos e notas quando for seguro." en: "Another assignee is also on this job" / "Your work is saved. Go back to Today or continue only with photos and notes when safe."
- **Recovery:** `FALLBACK` (Voltar para Hoje; Continuar só com fotos e notas when safe), `OFFICE`.
- **Data safety:** evidence captured by either assignee is kept; state changes may be rejected as reassigned.
- **Office sees:** possible duplicate active assignee alert with both names and latest activity.
- **Priority / owner:** P0 · T07 · refs BR-F2-4, OFF-05.
- **Test:** integration test: stale pull with different assignee shows banner, Voltar para Hoje, optional photos/notes-only path and late-evidence-safe behavior.

#### EC-WO-18 · Reopened by the office
- **When:** the office reopens a completed WO with a reason.
- **Detected by:** `WO_REOPENED_BY_OFFICE` (client) — server route notification pulled by the client.
- **User sees:** notification + job detail. pt-BR: "OS reaberta pela central" / "Seus dados estão salvos. Veja o motivo e continue a partir do serviço em andamento." en: "Job reopened by the office" / "Your data is saved. See the reason and continue from In progress."
- **Recovery:** `FALLBACK` (Open reopened job), `OFFICE`.
- **Data safety:** previous completion data, evidence and signature remain in the timeline; new work is appended.
- **Office sees:** reopened status, reason and notification delivery state.
- **Priority / owner:** P0 · T07 · refs WO-23, A§6.2, A§6.5.
- **Test:** service/mobile test: reopen notifies assignee, moves job to In progress and keeps previous completion artifacts.

#### EC-WO-19 · Assignee is off duty
- **When:** an office user assigns/reassigns a WO to a person whose duty status is OFF_DUTY or whose last sync is stale.
- **Detected by:** `WO_ASSIGNEE_OFF_DUTY` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** web dialog. pt-BR: "Responsável fora de serviço" / "A OS não foi perdida. Escolha alguém em serviço ou confirme a atribuição com aviso." en: "Assignee is off duty" / "The job was not lost. Choose someone on duty or confirm the assignment with a warning."
- **Recovery:** `FIX` (Choose an on-duty person), `ALT` (Assign anyway with warning).
- **Data safety:** WO draft and dispatch form values stay intact.
- **Office sees:** same dialog; if assigned anyway, timeline notes off-duty assignment.
- **Priority / owner:** P0 · T07 · refs WO-22, A§6.4 suggestions, D§3.
- **Test:** route/UI test: off-duty assignee displays warning, preserves form and records override if allowed.

#### EC-WO-20 · Part not in van stock
- **When:** in P1, the field worker tries to add a catalog part that is not in their van stock or the available quantity is below requested quantity.
- **Detected by:** `WO_PART_NOT_IN_VAN_STOCK` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Peça não está na sua viatura" / "A OS está salva. Use texto livre, coloque em espera por peças ou peça transferência." en: "Part is not in your van" / "The job is saved. Use free text, put the job on hold for parts or request a transfer."
- **Recovery:** `ALT` (Free-text part, On hold · waiting parts), `OFFICE`.
- **Data safety:** any entered part notes remain saved; stock is not decremented below the chosen rule without an explicit override.
- **Office sees:** hold/transfer request or free-text part line with no stock movement.
- **Priority / owner:** P1 · T14 · refs WO-09 (P1), T14, ERP-05.
- **Test:** stock test: missing van stock offers free-text/hold paths and prevents accidental stock movement.

#### EC-WO-21 · Arrival prompt looks wrong
- **When:** the P1 arrival prompt fires too early, fails to fire near the site, or the field worker is at the gate but outside the radius.
- **Detected by:** `WO_ARRIVAL_PROMPT_MISMATCH` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Você está no local?" / "A OS está salva. Confirme chegada, escolha 'ainda não' ou ajuste o ponto para a central." en: "Are you on site?" / "The job is saved. Confirm arrival, choose 'not yet' or send a point update to the office."
- **Recovery:** `ALT` (Confirm, Not yet, Send point update), `OFFICE`.
- **Data safety:** status never changes without the field worker's explicit confirmation.
- **Office sees:** optional point correction and arrival decision in the timeline.
- **Priority / owner:** P1 · T17 · refs WO-06, A§7.8, A§13.3.
- **Test:** Maestro/location test: false positive/negative prompt never auto-arrives and records the user's choice.

## 8. Rental (EC-RN)

#### EC-RN-01 · Rental time already booked
- **When:** a rental reservation or P1 extension overlaps another RESERVED or ACTIVE rental for the same asset.
- **Detected by:** `ASSET_DOUBLE_BOOKED` (server, HTTP 409) — runtime check for this case.
- **User sees:** inline. pt-BR: "Máquina já reservada nesse horário" / "Seus dados estão salvos. Escolha outro horário ou outra máquina." en: "Machine already booked then" / "Your data is saved. Choose another time or another machine."
- **Recovery:** `FIX` (change dates or asset), `OFFICE`.
- **Data safety:** the draft reservation stays saved; no duplicate rental is created.
- **Office sees:** nothing unless the user asks the office.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-02, A§6.3.
- **Test:** unit test: overlapping RESERVED and ACTIVE rentals return `ASSET_DOUBLE_BOOKED`; form keeps values and focuses dates.

#### EC-RN-02 · Machine cannot be rented
- **When:** the selected outbound asset is not rentable, is not `OPERATIONAL`, or has an open Critical/not-operable report.
- **Detected by:** `ASSET_NOT_RENTABLE` (server, HTTP 409) — runtime check for this case.
- **User sees:** inline. pt-BR: "Esta máquina não pode sair agora" / "Seus dados estão salvos. Veja o motivo e escolha outra máquina." en: "This machine cannot go out now" / "Your data is saved. Check the reason and choose another machine."
- **Recovery:** `FIX` (pick another asset), `OFFICE`.
- **Data safety:** the reservation draft and customer data remain unchanged.
- **Office sees:** nothing unless the user asks the office; the asset page already shows the blocking condition/report.
- **Priority / owner:** P0 · T08 · refs RN-02, A§6.3, A§6.4.
- **Test:** unit tests cover each eligibility code and show the exact reason in the asset picker.

#### EC-RN-03 · Customer details are missing
- **When:** reserving for a customer without CPF/CNPJ or phone/WhatsApp.
- **Detected by:** `CUSTOMER_INCOMPLETE` (server, HTTP 422) — runtime check for this case.
- **User sees:** inline. pt-BR: "Falta dado do cliente" / "A reserva está salva. Informe CPF/CNPJ e telefone para continuar." en: "Customer details are missing" / "The reservation is saved. Add tax ID and phone to continue."
- **Recovery:** `FIX` (edit customer in place), `DRAFT`, `OFFICE`.
- **Data safety:** the rental draft is kept while the customer record is completed.
- **Office sees:** customer profile marked incomplete if the draft is saved.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-02, A§5.3.
- **Test:** route/component test: missing doc and phone shows inline errors and preserves the rental form.

#### EC-RN-04 · Rental dates are invalid
- **When:** planned start or end is in the past, end is before start, or the date range is otherwise invalid.
- **Detected by:** `RENTAL_DATES_INVALID` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** inline. pt-BR: "Revise as datas da locação" / "Seus dados estão salvos. Use uma data futura e um fim depois do início." en: "Check the rental dates" / "Your data is saved. Use a future date and an end after the start."
- **Recovery:** `FIX` (focus date fields), `DRAFT`.
- **Data safety:** the draft stays saved with the invalid values until corrected.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-02.
- **Test:** schema and UI tests reject past dates/end-before-start and keep all typed values.

#### EC-RN-05 · Machine is at another site
- **When:** the selected asset is assigned to another site/yard than the pickup/delivery site and the user tries to reserve or start hand-over.
- **Detected by:** `RENTAL_SITE_MISMATCH` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Máquina em outro local" / "Seus dados estão salvos. Escolha entrega, ajuste o local ou peça ajuda ao escritório." en: "Machine is at another site" / "Your data is saved. Choose delivery, change the site, or ask the office."
- **Recovery:** `ALT` (switch to delivery or pick current site), `FIX`, `OFFICE`.
- **Data safety:** the rental draft and selected asset are kept.
- **Office sees:** optional Needs attention item if the user asks the office with context.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-02, A§5.3.
- **Test:** reservation test: asset.currentSiteId different from rental.siteId shows alternatives and does not clear the draft.

#### EC-RN-06 · QR is for another machine
- **When:** during check-out the scanned QR belongs to an asset different from `rental.assetId`.
- **Detected by:** `RENTAL_ASSET_MISMATCH` (server, HTTP 409) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Esta não é a máquina da locação" / "A vistoria está salva. Escaneie a máquina correta ou digite o código." en: "This is not the rental machine" / "The inspection is saved. Scan the right machine or type the code."
- **Recovery:** `ALT` (type code or search asset), `FIX` (scan again), `OFFICE`.
- **Data safety:** any check-out draft remains attached to the intended rental, not to the wrong asset.
- **Office sees:** nothing unless the rejected checkout is sent, then the conflict appears in Needs attention.
- **Priority / owner:** P0 · T08 · refs RN-04, A§7.3, A§13.3.
- **Test:** Maestro/component test: wrong QR opens the sheet; manual code entry resumes the same step.

#### EC-RN-07 · Rental cancelled before hand-over
- **When:** an offline check-out is sent after the rental was cancelled or is no longer RESERVED.
- **Detected by:** `RENTAL_NOT_RESERVED` (server, HTTP 409) — runtime check for this case.
- **User sees:** banner. pt-BR: "Locação não está mais reservada" / "Suas fotos e assinaturas foram guardadas. O escritório foi avisado." en: "Rental is no longer reserved" / "Your photos and signatures were kept. The office was notified."
- **Recovery:** `HANDOFF`, `DRAFT` (keep inspection locally), `OFFICE`.
- **Data safety:** the inspection evidence stays on the device and in the conflict record; it is not discarded.
- **Office sees:** rejected mutation in Needs attention with rental snapshot and inspection evidence status.
- **Priority / owner:** P0 · T08 · refs RN-04, A§7.3, A§7.6.
- **Test:** offline conflict test: cancel rental, send checkout, assert conflict copy and evidence retention.

#### EC-RN-08 · Inspection photo needs retake
- **When:** a required walkaround photo is skipped, too dark, too blurry, or does not match the requested angle.
- **Detected by:** `RENTAL_PHOTO_UNUSABLE` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Refaça esta foto" / "Sua vistoria está salva. Tire uma foto clara desta parte da máquina." en: "Retake this photo" / "Your inspection is saved. Take a clear photo of this part of the machine."
- **Recovery:** `FIX` (retake with guide), `ALT` (choose from gallery), `DRAFT`.
- **Data safety:** existing photos remain until replaced or deleted with Undo.
- **Office sees:** nothing until the check-out is confirmed.
- **Priority / owner:** P0 · T08 · refs RN-04, A§13.3, A§7.7.
- **Test:** component test: missing/dark/blurred photo blocks Next with retake and gallery actions.

#### EC-RN-09 · Checkout reading needs review
- **When:** the checkout hour meter/odometer is lower than the last known value or jumps far above expected use.
- **Detected by:** `METER_READING_LOWER` / `METER_READING_JUMP` (server, new, HTTP 409) — client pre-check and server reading guard.
- **User sees:** sheet. pt-BR: "Confira a leitura" / "A vistoria está salva. Corrija o número, confirme o salto ou marque troca de medidor com foto." en: "Check the reading" / "The inspection is saved. Fix the number, confirm the jump or mark that the meter was replaced with a photo."
- **Recovery:** `FIX` (edit reading), `ALT` (Meter was replaced with required photo; Confirm big jump), `OFFICE`.
- **Data safety:** the typed reading and photo are kept; the asset master reading is not lowered automatically.
- **Office sees:** timeline note if the checkout is submitted with an explained exception.
- **Priority / owner:** P0 · T08 · refs RN-04, A§6.4, A§7.4.
- **Test:** component/unit test: lower and implausible checkout readings show recovery; corrected value clears it; exception evidence persists.

#### EC-RN-10 · Accessory missing at hand-over
- **When:** a required accessory from the template is missing or quantity is lower at check-out.
- **Detected by:** `RENTAL_ACCESSORIES_MISSING` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Confira os acessórios" / "A vistoria está salva. Ajuste a quantidade ou registre o que não será entregue." en: "Check the accessories" / "The inspection is saved. Adjust the quantity or record what will not be handed over."
- **Recovery:** `FIX` (edit quantities/add note/photo), `DRAFT`, `OFFICE`.
- **Data safety:** the accessory answers are kept in the draft.
- **Office sees:** hand-over report lists missing accessories when confirmed.
- **Priority / owner:** P0 · T08 · refs RN-04, A§5.4, A§13.3.
- **Test:** component test: required accessory qty 0 requires note/photo before summary.

#### EC-RN-11 · Safety orientation missing
- **When:** the safety orientation checkbox, operator name, or required operator document is missing at check-out.
- **Detected by:** `RENTAL_SAFETY_BRIEFING_MISSING` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Falta a orientação de segurança" / "A entrega está salva. Confirme a orientação e informe o operador." en: "Safety orientation is missing" / "The hand-over is saved. Confirm the orientation and enter the operator."
- **Recovery:** `FIX` (open safety orientation step), `DRAFT`.
- **Data safety:** all previous check-out steps stay saved.
- **Office sees:** rejected checkout in Needs attention only if the incomplete action was sent.
- **Priority / owner:** P0 · T08 · refs RN-04, A§6.3.
- **Test:** validation test: missing orientation/operator blocks summary and server guard returns `GUARD_CHECKOUT_INCOMPLETE`.

#### EC-RN-12 · Older terms were signed
- **When:** the device captured acceptance offline with an older rental terms version than the current organization terms.
- **Detected by:** `RENTAL_TERMS_OLDER_ACCEPTED` (client) — runtime check for this case.
- **User sees:** banner after send. pt-BR: "Termos antigos assinados" / "A entrega está salva com a versão assinada. A central recebeu um aviso para revisar." en: "Older terms were signed" / "The hand-over is saved with the signed version. The office received a note to review."
- **Recovery:** `HANDOFF` (Office reviews older terms), `FALLBACK` (continue with signed version), `OFFICE`.
- **Data safety:** the checkout is accepted with the exact terms version that was signed; photos, readings, signature and terms snapshot are preserved.
- **Office sees:** attention item `Signed older terms vN`, rental `termsVersion`, signer and signed PDF snapshot.
- **Priority / owner:** P0 · T08 · refs RN-04, PLT-16, REC-09, G4.6.
- **Test:** sync conflict test: bump org terms, send offline checkout, assert accepted checkout with older `termsVersion` and attention item, not rejection.

#### EC-RN-13 · Signature not completed
- **When:** the check-out customer/representative is absent or refuses to sign, the check-in signer is absent/refuses, or the signature pad fails/saves a blank image.
- **Detected by:** `RENTAL_SIGNER_UNAVAILABLE` (client, contexts `checkout` and `checkin`) — runtime check for this case.
- **User sees:** sheet. `checkout` pt-BR: "Assinatura pendente na entrega" / "A entrega fica salva como rascunho até o cliente ou representante assinar." en: "Hand-over signature pending" / "The hand-over stays saved as a draft until the customer or representative signs." `checkin` pt-BR: "Assinatura pendente na devolução" / "A devolução está salva. Registre o motivo para finalizar sem assinatura." en: "Return signature pending" / "The return is saved. Record the reason to finish without a signature."
- **Recovery:** `RETRY` (open pad again), `ALT` (representative signer or absence/refusal reason), `DRAFT`, `OFFICE`.
- **Data safety:** check-out without a customer or representative signature remains a draft; check-in may finish with absent/refused reason and disputed damages marked not acknowledged.
- **Office sees:** signer status, reason, representative data when used, or 48 h dispute window for return damages. A check-in with new damages and an `ABSENT` or `REFUSED` signature writes the `rental.damagesNotAcknowledged` attention activity; the office reviews the damages within the 48 h dispute window.
- **Priority / owner:** P0 · T08 · refs RN-04, RN-07, RN-08, G4.2, O27.
- **Test:** component tests: `checkout` absent/refused cannot complete and saves draft; `checkin` absent/refused completes with reason and dispute marker.

#### EC-RN-14 · Hand-over incomplete when sent
- **When:** the server rejects the composite `rental.checkout` mutation because required evidence is missing after template or rental data changed.
- **Detected by:** `GUARD_CHECKOUT_INCOMPLETE` (server, HTTP 409) — runtime check for this case.
- **User sees:** banner. pt-BR: "Falta uma etapa da entrega" / "Seus dados estão salvos. Abra a etapa marcada e complete o que falta." en: "A hand-over step is missing" / "Your data is saved. Open the marked step and add what is missing."
- **Recovery:** `FIX` (highlight missing step), `DRAFT`, `OFFICE`.
- **Data safety:** checkout is confirmed in one step with inspection, readings, accessories, signatures and charges estimate in one transaction; any rejection keeps the whole hand-over as a draft/conflict with all media and answers.
- **Office sees:** unresolved rejected mutation with missing guard details.
- **Priority / owner:** P0 · T08 · refs RN-04, A§6.3, A§7.3, A§21 A6.
- **Test:** table-driven server tests reject each missing checkout evidence item and mobile highlights the returned step; no partial rental state changes are committed.

#### EC-RN-15 · Hand-over document unavailable
- **When:** the rental hand-over PDF/document cannot be generated, is not available in the chosen customer language, or cannot be shared.
- **Detected by:** `RENTAL_DOCUMENT_UNAVAILABLE` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Comprovante indisponível agora" / "A entrega foi salva. Tente de novo ou compartilhe quando o documento ficar pronto." en: "Document not available now" / "The hand-over is saved. Try again or share when the document is ready."
- **Recovery:** `RETRY`, `FALLBACK` (show/share after next send), `OFFICE`.
- **Data safety:** the completed checkout and document request remain saved; no rental data is lost.
- **Office sees:** document/share failure in the rental timeline if it persists.
- **Priority / owner:** P0 · T08 · refs PLT-16, RN-04, D§3 T08 PDFs.
- **Test:** component/integration test: PDF/share failure keeps Active rental and shows retry plus later-share fallback.

#### EC-RN-16 · Hand-over interrupted
- **When:** the app closes, battery dies, or the field worker leaves the checkout wizard before confirming hand-over.
- **Detected by:** `RENTAL_DRAFT_INTERRUPTED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Entrega salva como rascunho" / "Você pode continuar do mesmo passo. Nada foi perdido." en: "Hand-over saved as a draft" / "You can continue from the same step. Nothing was lost."
- **Recovery:** `DRAFT` (resume), `UNDO` (discard draft with undo).
- **Data safety:** autosaved draft, media and signatures remain on the device until submitted or intentionally discarded.
- **Office sees:** nothing until the hand-over is confirmed; stale drafts may show only in device diagnostics.
- **Priority / owner:** P0 · T08 · refs REC-04, REC-11, RN-04, A§13.3.
- **Test:** crash/resume test: kill app mid-checkout, relaunch, and resume at the same step with media intact.

#### EC-RN-17 · Rental is overdue
- **When:** an ACTIVE rental is past planned end plus the organization grace period.
- **Detected by:** `RENTAL_OVERDUE` (client) — worker/client derived state.
- **User sees:** banner. pt-BR: "Locação em atraso" / "Os dados estão salvos. Faça a devolução agora ou combine o próximo passo." en: "Rental is overdue" / "Your data is saved. Check the machine in now or arrange the next step."
- **Recovery:** `ALT` (start check-in, call/WhatsApp customer), `OFFICE`.
- **Data safety:** the active rental remains available offline; late charges are recalculated at check-in.
- **Office sees:** overdue alert and notification from `rentals.overdueScan`.
- **Priority / owner:** P0 · T08 · refs RN-03, RN-05, BR-F3-1, D§3 worker.
- **Test:** worker test: overdue notification fires once; mobile banner offers check-in and customer contact.

#### EC-RN-18 · Early return
- **When:** the field worker starts check-in before the planned end and the customer wants to return early.
- **Detected by:** `RENTAL_EARLY_RETURN` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Devolução antecipada" / "A vistoria está salva. Confira as cobranças antes de confirmar." en: "Early return" / "The inspection is saved. Review the charges before confirming."
- **Recovery:** `FIX` (review charges and confirm actual return time), `DRAFT`, `OFFICE`.
- **Data safety:** check-in evidence stays saved; charges are only finalized on close.
- **Office sees:** timeline note with actual return time after check-in.
- **Priority / owner:** P0 · T08 · refs RN-07, RN-08, A§7.4.
- **Test:** component test: early check-in shows review sheet and uses actualEnd in charge preview.

#### EC-RN-19 · Machine broke during rental
- **When:** the customer or field worker reports that a rented asset broke before return.
- **Detected by:** `RENTAL_BREAKDOWN_REPORTED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Máquina com problema na locação" / "O relato será ligado à locação. Registre fotos para o escritório agir." en: "Machine problem during rental" / "The report will be linked to the rental. Add photos so the office can act."
- **Recovery:** `ALT` (open field report for this rental), `OFFICE`, `DRAFT`.
- **Data safety:** the active rental remains open; the report draft is saved if started offline.
- **Office sees:** field report linked to the rental and asset; severe/not-operable reports affect asset condition.
- **Priority / owner:** P0 · T08 · refs RN-05, A§5.3, A§7.3.
- **Test:** integration test: report created from active rental sets `rentalId` and remains visible on rental detail.

#### EC-RN-20 · Machine moved to another place
- **When:** the customer moved the rented asset to another farm/site or the field worker detects a different return location.
- **Detected by:** `RENTAL_LOCATION_CHANGED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Local da máquina mudou" / "A locação está salva. Atualize o local atual ou avise o escritório." en: "Machine location changed" / "The rental is saved. Update the current site or notify the office."
- **Recovery:** `FIX` (pick current site/location), `OFFICE`.
- **Data safety:** the rental and check-in draft remain saved; old and new locations are kept in the timeline.
- **Office sees:** location-change note/Needs attention item with rental and asset context.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-07, A§5.3.
- **Test:** component test: changing return site requires note and creates timeline metadata without losing check-in progress.

#### EC-RN-21 · Rental is not active
- **When:** an offline check-in is sent for a rental that was not ACTIVE anymore, was cancelled, or was already returned/closed.
- **Detected by:** `RENTAL_NOT_ACTIVE` (server, HTTP 409) — runtime check for this case.
- **User sees:** banner. pt-BR: "Locação não está ativa" / "A vistoria de devolução foi guardada. O escritório foi avisado." en: "Rental is not active" / "The return inspection was kept. The office was notified."
- **Recovery:** `HANDOFF`, `DRAFT`, `OFFICE`.
- **Data safety:** photos, readings, damages and signatures stay in the conflict record/local draft.
- **Office sees:** rejected check-in in Needs attention with rental snapshot.
- **Priority / owner:** P0 · T08 · refs RN-07, A§7.3, A§7.6.
- **Test:** offline conflict test: close/cancel rental elsewhere, send check-in, assert retained evidence and Needs attention item.

#### EC-RN-22 · Item did not return with machine
- **When:** a check-in records fewer accessories than were handed over, or required return evidence is missing.
- **Detected by:** `RENTAL_ACCESSORY_RETURN_MISSING` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Confira os itens da devolução" / "A devolução está salva. Marque o item faltante e adicione foto ou observação." en: "Check the returned items" / "The return is saved. Mark the missing item and add a photo or note."
- **Recovery:** `FIX` (edit item/note/photo), `DRAFT`, `OFFICE`.
- **Data safety:** the check-in draft and comparison with check-out remain saved.
- **Office sees:** return report and charges review show missing items after submission; rejected incomplete check-ins appear in Needs attention.
- **Priority / owner:** P0 · T08 · refs RN-07, BR-F3-3, A§6.3.
- **Test:** component/server tests require missing accessory note/photo and reject incomplete return evidence.

#### EC-RN-23 · Damage is hard to compare
- **When:** mud, low light, or photo angle makes it unclear whether a check-in damage matches a pre-existing damage.
- **Detected by:** `RENTAL_DAMAGE_MATCH_UNCLEAR` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Não deu para comparar o dano" / "A vistoria está salva. Tire outra foto ou marque como dúvida para revisão." en: "Damage comparison is unclear" / "The inspection is saved. Take another photo or mark it for review."
- **Recovery:** `FIX` (clean and re-photograph/compare side by side), `HANDOFF` (mark as unclear), `OFFICE`.
- **Data safety:** both old and new evidence are kept; unclear damage is not charged until office review.
- **Office sees:** damage marked for review on rental detail with both photo sets.
- **Priority / owner:** P0 · T08 · refs RN-07, RN-08, A§5.3, A§13.3.
- **Test:** component test: “not sure” path requires a new photo/note and creates a review flag.

#### EC-RN-24 · Customer disputed the damage
- **When:** the customer says a new damage was already there or disagrees with the condition/cost at check-in.
- **Detected by:** `RENTAL_DAMAGE_DISPUTED` (client) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Dano contestado" / "A vistoria está salva. Registre a versão do cliente e continue sem finalizar a cobrança." en: "Damage disputed" / "The inspection is saved. Record the customer's statement and continue without finalizing the charge."
- **Recovery:** `FIX` (add dispute note/photo/signature status), `HANDOFF`, `OFFICE`.
- **Data safety:** the damage evidence and customer statement are preserved; charges stay editable before close.
- **Office sees:** disputed damage badge in Needs attention/rental detail.
- **Priority / owner:** P0 · T08 · refs RN-07, RN-08, A§5.3.
- **Test:** component/integration test: disputed damage requires note and prevents silent auto-close of that damage charge.

#### EC-RN-25 · Damage cost is open
- **When:** a new damage is found but the field worker cannot estimate the cost in the field.
- **Detected by:** `RENTAL_DAMAGE_COST_UNKNOWN` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Valor do dano em aberto" / "A vistoria está salva. Você pode marcar sem valor e o escritório revisa depois." en: "Damage cost is open" / "The inspection is saved. You can mark no amount and the office will review it later."
- **Recovery:** `FIX` (enter amount or mark unknown), `HANDOFF`.
- **Data safety:** the damage is saved with evidence; charge line is zero/placeholder until edited.
- **Office sees:** Needs attention item for damage cost review and rental charges editor.
- **Priority / owner:** P0 · T08 · refs RN-08, A§7.4.
- **Test:** unit/component test: null estimated cost produces zero damage line and review badge, not a blocked check-in.

#### EC-RN-26 · Return reading needs review
- **When:** check-in hour meter/odometer is lower than checkout or jumps beyond plausible use.
- **Detected by:** `METER_READING_LOWER` / `METER_READING_JUMP` (server, new, HTTP 409) — client pre-check and server reading guard.
- **User sees:** sheet. pt-BR: "Confira a leitura da devolução" / "A devolução está salva. Corrija, confirme o salto ou registre troca de medidor com foto." en: "Check the return reading" / "The return is saved. Fix it, confirm the jump or record a meter replacement with a photo."
- **Recovery:** `FIX` (edit reading), `ALT` (Meter was replaced with required photo; Confirm big jump), `OFFICE`.
- **Data safety:** the check-in draft is kept; asset master readings are not lowered automatically and charges wait for the explained reading.
- **Office sees:** meter exception in rental timeline and charges review.
- **Priority / owner:** P0 · T08 · refs RN-07, RN-08, A§6.4, A§7.4.
- **Test:** component/unit test: lower or implausible check-in reading blocks charge preview until corrected, confirmed or meter-replacement evidence is added.

#### EC-RN-27 · Fuel reading is not possible
- **When:** fuel percent is outside 0–100, contradicts tank settings, or cannot be read from the photo.
- **Detected by:** `RENTAL_FUEL_READING_INVALID` (client) — runtime check for this case.
- **User sees:** inline. pt-BR: "Confira o combustível" / "A vistoria está salva. Ajuste o nível ou tire outra foto do marcador." en: "Check the fuel level" / "The inspection is saved. Adjust the level or take another gauge photo."
- **Recovery:** `FIX` (edit slider/retake photo), `DRAFT`.
- **Data safety:** readings and photos stay in the draft.
- **Office sees:** nothing unless submitted with an exception note.
- **Priority / owner:** P0 · T08 · refs RN-04, RN-07, RN-08, A§7.4.
- **Test:** validation/component test: fuel values outside range and missing gauge photo show inline recovery.

#### EC-RN-28 · Totals updated by the office
- **When:** the server recomputes check-in charges differently from the device estimate, or the office edits charges before close.
- **Detected by:** `RENTAL_CHARGES_UPDATED` (server, new, HTTP 409) — rental check-in, close or charge-version route.
- **User sees:** sheet/banner. pt-BR: "Valores atualizados pela central" / "Sua vistoria está salva. Revise os valores atualizados antes de fechar." en: "Totals updated by the office" / "Your inspection is saved. Review the updated amounts before closing."
- **Recovery:** `FIX` (open charges review), `FALLBACK` (show latest values with timestamp), `HANDOFF`, `OFFICE`.
- **Data safety:** inspection evidence and the local estimate are kept; server recomputation or office edit wins, `chargesVersion` is recorded and the return PDF is reissued.
- **Office sees:** charges review item or activity entry with local estimate versus current charge lines.
- **Priority / owner:** P0 · T08 · refs RN-08, RN-10, REC-05, G4.7.
- **Test:** contract/integration test: changed settings or office edit returns `RENTAL_CHARGES_UPDATED`, shows line-by-line comparison and reissues the return PDF once accepted.

#### EC-RN-29 · Return incomplete when sent
- **When:** the server rejects the composite `rental.checkin` mutation because required evidence, matched-damage answers, signatures, readings or charges are missing after newer data is applied.
- **Detected by:** `GUARD_CHECKIN_INCOMPLETE` (server, HTTP 409) — runtime check for this case.
- **User sees:** banner. pt-BR: "Falta uma etapa da devolução" / "Seus dados estão salvos. Abra a etapa marcada e complete o que falta." en: "A return step is missing" / "Your data is saved. Open the marked step and add what is missing."
- **Recovery:** `FIX` (highlight missing step), `DRAFT`, `OFFICE`.
- **Data safety:** check-in is confirmed in one step with inspection, damages, readings, accessories, signature status and charges in one transaction; any rejection keeps the whole return inspection available with all evidence.
- **Office sees:** unresolved rejected mutation with guard details in Needs attention.
- **Priority / owner:** P0 · T08 · refs RN-07, A§6.3, A§7.3, A§21 A6.
- **Test:** table-driven server tests reject each missing check-in evidence item and mobile focuses the exact step; no partial return/charge state is committed.

#### EC-RN-30 · Another field worker is checking in
- **When:** the check-in is performed by a different person than the check-out, often because shifts changed.
- **Detected by:** `RENTAL_DIFFERENT_AGENT_CHECKIN` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Devolução por outra pessoa" / "A locação está salva. Confira a vistoria de entrega antes de continuar." en: "Return by another field worker" / "The rental is saved. Review the hand-over inspection before continuing."
- **Recovery:** `FIX` (review side-by-side evidence and sign as the current person), `OFFICE`.
- **Data safety:** original checkout signer and current check-in signer are both kept.
- **Office sees:** timeline shows both people and the check-in signer.
- **Priority / owner:** P0 · T08 · refs RN-07, A§5.3, A§13.3.
- **Test:** component test: different performedById shows banner and preserves both signer names in summary/PDF.

#### EC-RN-31 · Damage report was not created
- **When:** check-in finds a new damage and the atomic check-in + damage + field-report transaction cannot finish on the first try.
- **Detected by:** `RENTAL_DAMAGE_REPORT_FAILED` (server, new, HTTP 503) — runtime check for this case.
- **User sees:** banner. pt-BR: "Dano guardado para revisão" / "A devolução está salva. O escritório vai criar o relato se precisar." en: "Damage saved for review" / "The return is saved. The office will create the report if needed."
- **Recovery:** `AUTO` (idempotent retry), `HANDOFF`, `OFFICE`.
- **Data safety:** check-in, damages and auto-created field reports apply together; on failure the local draft/conflict keeps all damage photos and can retry with the same id.
- **Office sees:** Needs attention item for field report creation from rental damage.
- **Priority / owner:** P0 · T08 · refs RN-09, A§6.3, A§7.3.
- **Test:** integration test simulates report-create failure and asserts atomic retry/Needs attention with no lost damage evidence.

#### EC-RN-32 · Extension has no availability
- **When:** a P1 rental extension would overlap another reservation/active rental or violates availability.
- **Detected by:** `ASSET_DOUBLE_BOOKED` (server, HTTP 409) — runtime check for this case.
- **User sees:** inline. pt-BR: "Não há disponibilidade para estender" / "A locação está salva. Escolha outra data ou fale com o escritório." en: "No availability to extend" / "The rental is saved. Choose another date or contact the office."
- **Recovery:** `FIX` (choose another end date), `OFFICE`.
- **Data safety:** the active rental remains unchanged until a valid extension is accepted.
- **Office sees:** nothing unless the user asks for help; calendar still shows the conflict.
- **Priority / owner:** P1 · T15 · refs RN-06, RN-11, D§5 T15.
- **Test:** P1 integration test: extension into another reservation returns `ASSET_DOUBLE_BOOKED` and keeps old plannedEnd.

#### EC-RN-33 · Billing document failed
- **When:** P1 close should create/issue a rental billing document but billing generation, issue, or PDF creation fails.
- **Detected by:** `RENTAL_BILLING_DOCUMENT_FAILED` (server, new, HTTP 502) — runtime check for this case.
- **User sees:** sheet. pt-BR: "Cobrança não ficou pronta" / "A locação está salva. Tente de novo ou deixe para o escritório concluir." en: "Billing is not ready" / "The rental is saved. Try again or let the office finish it."
- **Recovery:** `RETRY`, `HANDOFF`, `OFFICE`.
- **Data safety:** closed/returned rental charges are preserved; no duplicate billing document is created on retry.
- **Office sees:** Needs attention item for billing completion with rental and charge totals.
- **Priority / owner:** P1 · T15 · refs RN-10, ERP-08, D§5 T15.
- **Test:** P1 idempotency test: billing failure then retry creates exactly one billing document with the rental total.

#### EC-RN-34 · Partner rental incomplete
- **When:** a P1 inbound rental is missing a supplier/partner customer, partner-owned asset, season/site, or the partner asset was created with the wrong owner type.
- **Detected by:** `INBOUND_RENTAL_INCOMPLETE` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** inline. pt-BR: "Falta dado da locação de parceiro" / "O rascunho está salvo. Complete parceiro, máquina e local para continuar." en: "Partner rental details are missing" / "The draft is saved. Complete partner, machine, and site to continue."
- **Recovery:** `FIX` (complete partner/asset/site), `DRAFT`, `OFFICE`.
- **Data safety:** inbound rental draft stays saved; no partner asset is duplicated on retry.
- **Office sees:** incomplete draft on web only if saved online.
- **Priority / owner:** P1 · T15 · refs RN-12, A§5.3, D§5 T15.
- **Test:** P1 validation test: INBOUND skips `ASSET_NOT_RENTABLE` but requires supplier and PARTNER asset ownership.

#### EC-RN-35 · Machine is not operational
- **When:** a rental reservation or hand-over selects an asset whose condition is not `OPERATIONAL`.
- **Detected by:** `ASSET_NOT_OPERATIONAL` (server, HTTP 409) — rental eligibility guard.
- **User sees:** inline. pt-BR: "Máquina fora de operação" / "A reserva está salva. Escolha uma máquina operacional ou peça revisão ao escritório." en: "Machine is not operational" / "The reservation is saved. Choose an operational machine or ask the office to review it."
- **Recovery:** `FIX` (choose another asset), `OFFICE`.
- **Data safety:** the rental draft, customer and dates are kept; no rental state changes until an eligible asset is chosen.
- **Office sees:** blocked eligibility ref on the asset/rental draft and current condition.
- **Priority / owner:** P0 · T08 · refs RN-02, A§6.3, A§6.4, A§21.
- **Test:** rental eligibility test: asset condition `NEEDS_REPAIR`, `IN_REPAIR`, `OUT_OF_SERVICE` or `RETIRED` returns `ASSET_NOT_OPERATIONAL` and preserves form values.

#### EC-RN-36 · Machine has a critical report
- **When:** a rental reservation or check-out selects an otherwise rentable asset that has an open Critical or not-operable field report.
- **Detected by:** `ASSET_HAS_CRITICAL_REPORT` (server, HTTP 409) — rental eligibility guard.
- **User sees:** inline. pt-BR: "Há relato crítico nesta máquina" / "A reserva está salva. Veja o relato e escolha outra máquina ou peça revisão ao escritório." en: "This machine has a critical report" / "The reservation is saved. Review the report and choose another machine or ask the office to review it."
- **Recovery:** `FIX` (choose another asset/review report), `OFFICE`.
- **Data safety:** rental draft data remains unchanged; no hand-over starts until the block is resolved.
- **Office sees:** eligibility block with the critical report link and requester.
- **Priority / owner:** P0 · T08 · refs RN-02, BR-F1-1, A§6.3, A§6.4, A§21.
- **Test:** rental eligibility test: open Critical/not-operable report returns `ASSET_HAS_CRITICAL_REPORT`, links the report and keeps the draft intact.

#### EC-RN-37 · Required signature missing
- **When:** server validation receives a composite checkout/check-in or document action that still requires a signer captured by the backend guard.
- **Detected by:** `GUARD_SIGNATURE_REQUIRED` (server, HTTP 409) — rental hand-over/return signature guard.
- **User sees:** sheet. pt-BR: "Assinatura obrigatória" / "A vistoria está salva. Colete a assinatura ou registre a alternativa permitida." en: "Signature required" / "The inspection is saved. Collect the signature or record the allowed alternative."
- **Recovery:** `FIX` (open signature step), `ALT` (representative signer or allowed reason), `HANDOFF`, `OFFICE`.
- **Data safety:** the full hand-over/return draft remains intact; no document is finalized with a missing required signature.
- **Office sees:** rejected guard details with rental, signer role and current draft snapshot.
- **Priority / owner:** P0 · T08 · refs RN-04, RN-07, A§6.3, A§21.
- **Test:** server guard test: missing required customer/agent signature returns `GUARD_SIGNATURE_REQUIRED`, keeps the composite draft and focuses the signature step.

#### EC-RN-38 · Rental not found
- **When:** a deep link, QR hand-over, sync conflict or office/mobile action references a rental that was removed from scope, archived, purged or never belonged to the organization.
- **Detected by:** `RENTAL_NOT_FOUND` (server, HTTP 404) — rental lookup guard.
- **User sees:** banner. pt-BR: "Locação não encontrada" / "Seus dados locais continuam salvos. Atualize a lista ou peça ajuda ao escritório." en: "Rental not found" / "Your local data stays saved. Refresh the list or ask the office for help."
- **Recovery:** `FALLBACK` (return to list/refresh), `OFFICE`.
- **Data safety:** local drafts and evidence are not deleted; if the rental re-enters scope, the same draft can be retried.
- **Office sees:** request ref with rental id and actor, without exposing cross-tenant data.
- **Priority / owner:** P0 · T08 · refs RN-01, RN-04, RN-07, A§8, A§21.
- **Test:** API/mobile test: missing or out-of-scope rental returns `RENTAL_NOT_FOUND`, returns to rental list and preserves any local draft.

## 9. Office web (EC-OPS)

#### EC-OPS-01 · Login temporarily blocked
- **When:** a user enters too many wrong passwords or the same IP/email hits the login limit.
- **Detected by:** `RATE_LIMITED` (server, HTTP 429, context `login`) — runtime check for this case.
- **User sees:** inline on login. pt-BR: "Muitas tentativas de entrada" / "Aguarde alguns minutos e tente de novo. Seus dados estão seguros." en: "Too many sign-in attempts" / "Wait a few minutes and try again. Your data is safe."
- **Recovery:** `RETRY`, `OFFICE`.
- **Data safety:** no form or business data is changed; the session stays signed out.
- **Office sees:** auth log with rate-limit reason and request ref; no password value.
- **Priority / owner:** P0 · T04 · refs PLT-01, A§8 Auth, A§11.
- **Test:** route/component test: `RATE_LIMITED.login` keeps email, shows wait copy and disables retry until the timer ends.

#### EC-OPS-02 · Session expired while editing
- **When:** the access token expires or is revoked while a web form has unsaved changes.
- **Detected by:** `TOKEN_EXPIRED` (server, HTTP 401, context `webEdit`) — server route or client refresh failure.
- **User sees:** dialog over the same page. pt-BR: "Entre de novo para continuar" / "O formulário ficou salvo nesta tela. Seus dados estão seguros." en: "Sign in again to continue" / "The form is still here. Your data is safe."
- **Recovery:** `REAUTH`, `DRAFT`, `OFFICE`.
- **Data safety:** unsaved values remain in memory and are not submitted until re-authentication succeeds.
- **Office sees:** auth/session log only; no form contents.
- **Priority / owner:** P0 · T04 · refs REC-12, REC-14, A§14.2.
- **Test:** Playwright: expire session during settings edit → re-login dialog → save succeeds with unchanged fields.

#### EC-OPS-03 · Page not allowed for this role
- **When:** a user opens a deep link or stale sidebar/bookmark to a page their roles cannot access.
- **Detected by:** `FORBIDDEN` (server, HTTP 403) — server route and client permission matrix.
- **User sees:** full screen. pt-BR: "Você não tem acesso a esta página" / "Nada foi alterado. Volte para uma página disponível para o seu perfil." en: "You do not have access to this page" / "Nothing changed. Go back to a page available for your role."
- **Recovery:** `ALT`, `OFFICE`.
- **Data safety:** no data is read or changed beyond the denied request.
- **Office sees:** audit/security log with user, route and ref.
- **Priority / owner:** P0 · T04 · refs PRD §5, A§11 RBAC, A§14.1.
- **Test:** route tests for role matrix: denied pages show allowed links and never render protected data.

#### EC-OPS-04 · Record no longer available
- **When:** a deep link opens a missing, deleted, archived or out-of-scope record.
- **Detected by:** `NOT_FOUND` (server, HTTP 404) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Registro não encontrado" / "Ele pode ter sido removido ou arquivado. Seus filtros e trabalho atual estão seguros." en: "Record not found" / "It may have been removed or archived. Your filters and current work are safe."
- **Recovery:** `ALT`, `RESTORE`, `OFFICE`.
- **Data safety:** current page state and filters are kept; no restore occurs without confirmation.
- **Office sees:** nothing unless the user asks for help or restores the record.
- **Priority / owner:** P0 · T04 · refs REC-06, A§14.1, A§19.
- **Test:** component/route test: missing asset/customer opens 404 with Back to list and Restore when allowed.

#### EC-OPS-05 · Someone changed this record
- **When:** two office users edit the same record and the second save is based on stale data.
- **Detected by:** `CONFLICT` (server, HTTP 409) — runtime check for this case.
- **User sees:** dialog. pt-BR: "Este registro mudou" / "Compare as alterações antes de salvar. Seus campos digitados foram mantidos." en: "This record changed" / "Review the newer changes before saving. Your typed fields were kept."
- **Recovery:** `FIX`, `DRAFT`, `RETRY`.
- **Data safety:** the stale save is rejected; the user's draft and the latest server values are both available.
- **Office sees:** activity timeline for the accepted change; failed save only in logs with ref.
- **Priority / owner:** P0 · T04 · refs REC-14, A§8 Errors, A§14.4.
- **Test:** integration/component test: stale `syncVersion` save returns conflict and the merge dialog preserves local edits.

#### EC-OPS-06 · Form needs a correction
- **When:** server validation rejects fields after submit, including CPF/CNPJ, phone, dates, money or required values.
- **Detected by:** `VALIDATION_FAILED` (server, HTTP 422, context `form`) — runtime check for this case.
- **User sees:** inline summary and field focus. pt-BR: "Revise os campos destacados" / "Nada foi salvo ainda. Corrija os campos marcados e tente de novo." en: "Review the highlighted fields" / "Nothing was saved yet. Fix the marked fields and try again."
- **Recovery:** `FIX`, `OFFICE`.
- **Data safety:** all typed values stay on screen; invalid values are not persisted.
- **Office sees:** validation ref in logs only.
- **Priority / owner:** P0 · T04 · refs REC-13, A§8, A§14.2.
- **Test:** component test: server field errors focus the first invalid field, keep values and show valid examples.

#### EC-OPS-07 · Bulk action partly finished
- **When:** a selected-table action succeeds for some rows and fails for others.
- **Detected by:** `BULK_PARTIAL_FAILURE` (client) — client aggregation.
- **User sees:** dialog. pt-BR: "Parte da ação foi concluída" / "Os itens concluídos estão seguros. Revise os itens com aviso e tente só eles de novo." en: "Part of the action finished" / "Completed items are safe. Review the warned items and retry only those."
- **Recovery:** `RETRY`, `FIX`, `ALT`.
- **Data safety:** successful rows are committed once; failed rows are unchanged and listed separately.
- **Office sees:** activity events for successful rows and per-row error refs for failed rows.
- **Priority / owner:** P0 · T04 · refs REC-14, UX-13, A§14.2.
- **Test:** component test: mixed result opens BulkResultDialog with Retry failed and downloadable results.

#### EC-OPS-08 · Import file cannot be read
- **When:** a CSV upload cannot be decoded after UTF-8, UTF-8-BOM and Latin-1 fallback checks; oversized CSV files are handled separately by the import validation context.
- **Detected by:** `CSV_ENCODING_UNSUPPORTED` (server, new, HTTP 422) for decoding failures. Oversized CSV returns `VALIDATION_FAILED` with context `import` and field error `FILE_TOO_LARGE` because Architecture §21.5 has no server `UPLOAD_FILE_INVALID` 413 entry.
- **User sees:** import screen. Decode failure pt-BR: "Não consegui ler este CSV" / "Nenhum dado foi importado. Salve novamente e envie o arquivo de novo." en: "Could not read this CSV" / "No data was imported. Save it again and upload the file once more." Oversize pt-BR: "CSV grande demais" / "Nenhum dado foi importado. Envie um arquivo menor ou divida a importação." en: "CSV is too large" / "No data was imported. Upload a smaller file or split the import."
- **Recovery:** `FIX`, `RETRY`, `OFFICE` for decoding; `FIX`, `RETRY` for `VALIDATION_FAILED.import`/`FILE_TOO_LARGE`.
- **Data safety:** the import is rejected before any row is written.
- **Office sees:** import attempt with file size, detected encoding or size limit, context and ref.
- **Priority / owner:** P0 · T04 · refs REC-14, A§8 Assets import, D§3.2, O29.
- **Test:** API test: unreadable fixture returns `CSV_ENCODING_UNSUPPORTED` 422; oversize fixture returns `VALIDATION_FAILED.import` with `FILE_TOO_LARGE`; both paths write no database rows and Latin-1 fallback is accepted when parseable.

#### EC-OPS-09 · Import columns need adjustment
- **When:** the CSV separator, columns or number/date formats remain ambiguous after auto-detection.
- **Detected by:** `CSV_FORMAT_UNSUPPORTED` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** import screen. pt-BR: "Revise o formato do CSV" / "Nenhuma linha foi importada. Use colunas esperadas e números como 1.234,56 ou 1234,56." en: "Review the CSV format" / "No rows were imported. Use the expected columns and numbers like 1.234,56 or 1234,56."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** no rows are persisted until the parser can map columns and numbers safely.
- **Office sees:** import attempt with parser warnings and ref.
- **Priority / owner:** P0 · T04 · refs REC-13, REC-14, A§8 Exports.
- **Test:** API tests: `;` with decimal comma passes; ambiguous mixed separator fails with examples.

#### EC-OPS-10 · Import has rows to review
- **When:** a CSV has duplicate rows, unknown references, invalid values or valid rows mixed with invalid rows.
- **Detected by:** `IMPORT_ROW_ERRORS` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** import review. pt-BR: "Algumas linhas precisam de revisão" / "As linhas válidas ainda não foram importadas. Baixe o relatório, corrija ou confirme a importação parcial." en: "Some rows need review" / "Valid rows are not imported yet. Download the report, fix the file or confirm a partial import."
- **Recovery:** `FIX`, `DRAFT`, `RETRY`.
- **Data safety:** valid rows are imported only after explicit confirmation; invalid rows are never guessed.
- **Office sees:** import preview with row numbers, reasons and who confirmed any partial import.
- **Priority / owner:** P0 · T04 · refs REC-14, A§8 Assets import.
- **Test:** integration test: mixed fixture produces downloadable error file; confirm partial writes only valid rows once.

#### EC-OPS-11 · Export will be prepared
- **When:** a CSV export is too large or slow to stream within the normal request budget.
- **Detected by:** `EXPORT_JOB_STARTED` (client, after the export route returns a 202 job-start payload) — runtime check for this case.
- **User sees:** toast plus notification entry. pt-BR: "Estamos preparando o arquivo" / "Você pode continuar trabalhando. Avisaremos quando o CSV estiver pronto." en: "We are preparing the file" / "You can keep working. We will notify you when the CSV is ready."
- **Recovery:** `AUTO`, `FALLBACK`.
- **Data safety:** export is read-only; filters are saved with the job.
- **Office sees:** export job status, requester, filters, completion/failure notification and download link.
- **Priority / owner:** P0 · T09 · refs REC-14, OPS-06, A§8 Exports.
- **Test:** API/worker test: large export returns 202, creates one job, the client shows `EXPORT_JOB_STARTED`, and one ready notification is sent.

#### EC-OPS-12 · Archive instead of delete
- **When:** a user tries to delete a record referenced by history, costs, reports, WOs or rentals.
- **Detected by:** `RECORD_IN_USE` (server, new, HTTP 409) — server route delete route checks references before changing the record.
- **User sees:** dialog. pt-BR: "Este registro tem histórico" / "Nada foi apagado. Arquive para esconder sem perder relatórios, custos ou locações." en: "This record has history" / "Nothing was deleted. Archive it to hide it without losing reports, costs or rentals."
- **Recovery:** `ALT` (Archive instead), `RESTORE`, `OFFICE`.
- **Data safety:** hard delete is blocked; archive keeps relationships and can be restored.
- **Office sees:** activity event if the user archives; blocked delete in logs with ref.
- **Priority / owner:** P0 · T04 · refs REC-06, PLT-13, A§5.3.
- **Test:** integration test: referenced asset/customer/site/part/template/user delete returns `RECORD_IN_USE`; Archive succeeds and history remains visible to allowed roles.

#### EC-OPS-13 · Template version is in use
- **When:** a checklist template is published while WOs or inspections already started with an older snapshot.
- **Detected by:** `TEMPLATE_VERSION_IN_USE` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** publish dialog. pt-BR: "A nova versão vale daqui para frente" / "Trabalhos em andamento continuam seguros com a versão antiga." en: "The new version applies from now on" / "Work already in progress stays safe on the old version."
- **Recovery:** `ALT`, `FALLBACK`.
- **Data safety:** old snapshots remain attached to in-progress work; the publish creates a new version only.
- **Office sees:** template timeline with version, publisher and affected in-progress count.
- **Priority / owner:** P0 · T04 · refs A§8 Checklist templates, A§14.1.
- **Test:** core/route test: publish bumps version; existing WO/inspection keeps previous snapshot and UI shows count.

#### EC-OPS-14 · Browser is offline
- **When:** the admin web loses network while viewing a page or filling a form.
- **Detected by:** `BROWSER_OFFLINE` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Sem conexão" / "Você pode continuar preenchendo. Os dados ficam nesta tela até a conexão voltar." en: "No connection" / "You can keep filling the form. The data stays on this screen until the connection returns."
- **Recovery:** `FALLBACK`, `RETRY`, `DRAFT`.
- **Data safety:** in-progress form state stays in the browser; no automatic submit occurs while offline.
- **Office sees:** nothing unless a later save or diagnostic is sent.
- **Priority / owner:** P0 · T04 · refs REC-04, REC-14, A§19.
- **Test:** Playwright: go offline during customer edit, keep typing, go online, save once.

#### EC-OPS-15 · Browser not supported
- **When:** the user opens the admin web in an unsupported or very old browser.
- **Detected by:** `UNSUPPORTED_BROWSER` (client) — runtime check for this case.
- **User sees:** full screen. pt-BR: "Atualize o navegador" / "Seus dados estão seguros. Use uma versão recente do Chrome, Edge, Safari ou Firefox." en: "Update your browser" / "Your data is safe. Use a recent Chrome, Edge, Safari or Firefox."
- **Recovery:** `UPDATE`, `ALT`, `OFFICE`.
- **Data safety:** the app does not load unsafe editing flows in unsupported browsers.
- **Office sees:** optional telemetry with browser family/version, no PII.
- **Priority / owner:** P0 · T04 · refs PRD §13 Devices, A§19.
- **Test:** browser-gate unit test: unsupported UA renders update page and no admin bundle interaction.

#### EC-OPS-16 · Upload not accepted
- **When:** a web upload for a CSV, template image or asset media has an unsupported type, unsafe name or exceeds size limits.
- **Detected by:** `UPLOAD_FILE_INVALID` (client) — runtime check for this case.
- **User sees:** inline near the file field. pt-BR: "Arquivo não aceito" / "Nada foi enviado. Escolha um arquivo no formato indicado e tente de novo." en: "File not accepted" / "Nothing was uploaded. Choose a supported file and try again."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** rejected files are not stored; other form fields remain unchanged.
- **Office sees:** upload attempt with reason and ref when the server rejected it.
- **Priority / owner:** P0 · T04 · refs A§8 Media, A§11 Media security.
- **Test:** component/API tests: invalid type and oversize upload keep form values and show allowed formats.

#### EC-OPS-17 · Live updates paused
- **When:** the Ops Center socket disconnects, token refresh for realtime fails, or reconnect is still in progress.
- **Detected by:** `REALTIME_DISCONNECTED` (client) — runtime check for this case.
- **User sees:** banner. pt-BR: "Atualizações ao vivo pausadas" / "Mostramos os últimos dados recebidos. A reconexão é automática." en: "Live updates paused" / "We are showing the last received data. Reconnection is automatic."
- **Recovery:** `AUTO`, `RETRY`, `FALLBACK`.
- **Data safety:** no office edits are lost; live positions may be stale and are timestamped.
- **Office sees:** realtime connection telemetry and gateway logs.
- **Priority / owner:** P0 · T09 · refs REC-14, OPS-10, A§9, A§14.3.
- **Test:** component test with mocked socket: disconnect shows last-update time and reconnect hides banner.

#### EC-OPS-18 · Map could not load
- **When:** map style, tile server or satellite layer fails while the Ops Center is open.
- **Detected by:** `MAP_TILES_UNAVAILABLE` (client) — runtime check for this case.
- **User sees:** map panel banner. pt-BR: "Mapa indisponível agora" / "A lista e os alertas continuam funcionando. Seus dados estão seguros." en: "Map unavailable right now" / "The list and alerts still work. Your data is safe."
- **Recovery:** `RETRY`, `FALLBACK`.
- **Data safety:** map rendering is read-only; no records are changed.
- **Office sees:** frontend telemetry with tile error and layer name.
- **Priority / owner:** P0 · T09 · refs OPS-01, OPS-02, A§14.3.
- **Test:** component test: map error event keeps side lists usable and exposes Try again.

#### EC-OPS-19 · No live operators right now
- **When:** no on-duty user has a recent presence or location fix.
- **Detected by:** `OPS_NO_LIVE_OPERATORS` (client) — runtime check for this case.
- **User sees:** empty state. pt-BR: "Ninguém aparece ao vivo agora" / "Os trabalhos e alertas continuam visíveis. Quando alguém entrar em serviço, o mapa atualiza." en: "No one is live right now" / "Jobs and alerts are still visible. When someone goes on duty, the map updates."
- **Recovery:** `FALLBACK`, `RETRY`.
- **Data safety:** historical records and open work remain unchanged.
- **Office sees:** the same empty state; no alert unless devices are stale by OFF-11.
- **Priority / owner:** P0 · T09 · refs OPS-01, OPS-05, A§9 Live operators.
- **Test:** component test: empty live operators renders guidance, not an error modal.

#### EC-OPS-20 · Operator position is old
- **When:** an operator's last location or presence is older than 5 minutes.
- **Detected by:** `OPERATOR_STALE` (client) — runtime check for this case.
- **User sees:** marker label and side-panel banner. pt-BR: "Localização desatualizada" / "Mostramos a última posição conhecida. O trabalho do operador continua seguro." en: "Location is out of date" / "We are showing the last known position. The operator's work is safe."
- **Recovery:** `FALLBACK`, `AUTO`, `OFFICE`.
- **Data safety:** only the displayed position is stale; jobs and evidence are unaffected.
- **Office sees:** stale state, last update time, battery if known and device sync health link.
- **Priority / owner:** P0 · T09 · refs OPS-01, OFF-11, A§6.4, A§9.
- **Test:** unit/component test: >5 min derives OFFLINE/old marker with timestamp and device link.

#### EC-OPS-21 · Alerts are grouped
- **When:** many alerts of the same type arrive in a short time and would flood the panel.
- **Detected by:** `ALERTS_COLLAPSED` (client) — client or server route alert grouping.
- **User sees:** alerts panel. pt-BR: "Alertas parecidos agrupados" / "Nenhum alerta foi escondido. Abra o grupo para resolver um por vez." en: "Similar alerts were grouped" / "No alert was hidden. Open the group to handle them one by one."
- **Recovery:** `FALLBACK`, `FIX`.
- **Data safety:** every alert remains addressable; grouping changes only presentation.
- **Office sees:** grouped count, newest/oldest time and filters to drill into each item.
- **Priority / owner:** P0 · T09 · refs OPS-05, UX-13, A§14.3.
- **Test:** component test: 100 seeded alerts group by type and all items remain reachable with keyboard.

#### EC-OPS-22 · Assignee cannot receive this job
- **When:** an office user assigns/reassigns a WO to a deactivated, archived, deleted or not-yet-joined user.
- **Detected by:** `ASSIGNEE_UNAVAILABLE` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** assign dialog. pt-BR: "Escolha outro responsável" / "A OS não foi alterada. Este usuário está inativo ou ainda não entrou." en: "Choose another assignee" / "The work order was not changed. This user is inactive or has not joined yet."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** the current assignee and WO state remain unchanged.
- **Office sees:** failed assignment ref and the reason in the dialog; no activity event for a change.
- **Priority / owner:** P0 · T07 · refs WO-22, A§8 Work orders, PRD §5.
- **Test:** API test: assign to inactive or not-yet-joined user returns 409 and does not touch dependents.

#### EC-OPS-23 · Attention item already resolved
- **When:** two office users open the same Needs attention item and one resolves it first.
- **Detected by:** `ALREADY_RESOLVED` (server, new, HTTP 409) — server route attention resolve route detects an item already resolved by another user.
- **User sees:** toast/dialog. pt-BR: "Este item já foi resolvido" / "Nada mais precisa ser feito. Atualizamos a fila para você." en: "This item was already resolved" / "There is nothing else to do. We refreshed the queue for you."
- **Recovery:** `FALLBACK`, `RETRY`.
- **Data safety:** the earlier resolution stays recorded; duplicate notes are not created.
- **Office sees:** resolver name, time and note on the item history.
- **Priority / owner:** P0 · T09 · refs REC-09, A§21 Needs attention, D§3.2.
- **Test:** API/component test: second resolve returns `ALREADY_RESOLVED`, queue refreshes and shows colleague name/note.

#### EC-OPS-24 · Diagnostics no longer available
- **When:** a diagnostics item was pruned, belongs to another organization, or its payload cannot be opened.
- **Detected by:** `DIAGNOSTICS_UNAVAILABLE` (server, new, HTTP 410) — runtime check for this case.
- **User sees:** detail panel. pt-BR: "Diagnóstico indisponível" / "A fila continua segura. Peça um novo diagnóstico se ainda precisar investigar." en: "Diagnostic unavailable" / "The queue is still safe. Ask for a new diagnostic if you still need to investigate."
- **Recovery:** `FALLBACK`, `DIAG`, `OFFICE`.
- **Data safety:** no business record is changed; diagnostics contain no form contents or PII.
- **Office sees:** item state as expired/unavailable and device link if the device still exists.
- **Priority / owner:** P0 · T04 · refs REC-08, REC-09, A§21 Diagnostics.
- **Test:** route test: expired diagnostic opens a safe empty state with device link and no raw payload leak.

#### EC-OPS-25 · Office contact is missing
- **When:** an error surface needs Ask the office, but `officePhone` and WhatsApp are not configured.
- **Detected by:** `OFFICE_CONTACT_MISSING` (client, context `settings`) — client or settings validation.
- **User sees:** settings/banner. pt-BR: "Telefone do escritório não configurado" / "Os dados estão seguros. Adicione um contato para liberar ajuda por ligação ou WhatsApp." en: "Office phone is not set" / "Data is safe. Add a contact to enable call or WhatsApp help."
- **Recovery:** `FIX`.
- **Data safety:** current records are unaffected; only the help shortcut is unavailable.
- **Office sees:** settings page warning and recovery-kit health check.
- **Priority / owner:** P0 · T04 · refs REC-07, A§21 Org settings, A§14.1.
- **Test:** settings test: missing phone blocks AskOfficeButton health check, shows only the fix action and valid E.164 phone clears warning.

#### EC-OPS-26 · Organization time zone invalid
- **When:** an admin saves a missing or invalid organization timezone, or a timezone change would alter displayed due times.
- **Detected by:** `VALIDATION_FAILED` (server, HTTP 422, context `timezone`) — server route and client preview.
- **User sees:** settings form. pt-BR: "Revise o fuso horário" / "Nada foi salvo ainda. Confira como os horários serão exibidos antes de aplicar." en: "Review the time zone" / "Nothing was saved yet. Check how times will be shown before applying."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** stored UTC times do not change; only display formatting changes after a valid save.
- **Office sees:** settings audit event only after a successful change.
- **Priority / owner:** P0 · T04 · refs PRD §13 Localization, A§14.4, A§19.
- **Test:** component/API test: invalid timezone is rejected; valid change previews due-date display and writes one audit event.

#### EC-OPS-27 · Field role on the office web
- **When:** a FIELD user signs in to the office web or follows a web-only link.
- **Detected by:** `OFFICE_ROLE_REQUIRED` (server, new, HTTP 403) — web route guard for office-only pages.
- **User sees:** full screen. pt-BR: "O escritório é para Administrador e Gestor" / "Use o app AgroRende no celular. Precisa de acesso? Fale com o administrador." en: "The office is for Admins and Managers" / "Use the AgroRende app on your phone. Need access? Talk to your admin."
- **Recovery:** `FALLBACK` (store badges + QR), `OFFICE` (talk to an admin).
- **Data safety:** no web mutation is attempted; the user's mobile data and pending field work are unchanged.
- **Office sees:** optional auth event for FIELD-on-web attempts; no support item unless the user asks.
- **Priority / owner:** P0 · T04 · refs PLT-02, PLT-19, A§8, A§14.
- **Test:** Playwright: FIELD user signs in on web → full page with app-store badges, QR and Sign out, with no office shell loaded.

#### EC-OPS-28 · Company needs an administrator
- **When:** an ADMIN tries to demote, deactivate or delete the last active ADMIN, including their own account deletion.
- **Detected by:** `LAST_ADMIN` (server, new, HTTP 409) — Team role/deactivation/delete guards.
- **User sees:** sheet. pt-BR: "A empresa precisa de um Administrador" / "Promova outra pessoa a Administrador antes." en: "The company needs an Admin" / "Make someone else an Admin first."
- **Recovery:** `FIX` (promote another active person first).
- **Data safety:** the role, deactivation or deletion is not applied; all company data and sessions remain unchanged.
- **Office sees:** blocked action ref on Team/Account audit logs; no user state changes until another ADMIN exists.
- **Priority / owner:** P0 · T02/T04/T03 · refs PLT-21, PLT-22, A§8, A§11, A§14.
- **Test:** API/Playwright: demote, deactivate and delete the last ADMIN return `LAST_ADMIN`; promoting another ADMIN makes the action available.

#### EC-OPS-29 · Company access paused (office)
- **When:** an ADMIN or MANAGER opens the office web while the organization is SUSPENDED or CANCELLED but still inside the export window.
- **Detected by:** `ORG_SUSPENDED` (server, new, HTTP 403) — org-status gate on office mutations and subscription state loader.
- **User sees:** banner on every office page, read-only. pt-BR: "Acesso pausado: só leitura" / "Você ainda pode ver e exportar os dados. Fale com a AgroRende para reativar." en: "Access paused: read-only" / "You can still view and export data. Talk to AgroRende to reactivate."
- **Recovery:** `FALLBACK` (Export), `OFFICE` (WhatsApp AgroRende).
- **Data safety:** reads and CSV exports stay available until purge; office writes are blocked without changing forms, and field outboxes follow EC-PLT-40.
- **Office sees:** the same banner plus Settings → Subscription status, export deadline and support contact.
- **Priority / owner:** P0 · T20 · refs TEN-02, TEN-03, TEN-04, TEN-07, A§8, A§11, A§14.
- **Test:** Playwright/API: suspended org shows read-only banner on all office pages, blocks mutations, allows CSV export and clears after platform reactivation.

#### EC-OPS-30 · Resolution note required
- **When:** an office user tries to resolve a Needs attention conflict without selecting the required outcome, note, assignee or evidence decision.
- **Detected by:** `GUARD_RESOLUTION_REQUIRED` (server, HTTP 409) — attention resolution guard.
- **User sees:** inline. pt-BR: "Informe como foi resolvido" / "Nada foi fechado ainda. Escolha a resolução e salve a observação." en: "Add how this was resolved" / "Nothing was closed yet. Choose the resolution and save the note."
- **Recovery:** `FIX` (focus missing resolution fields), `DRAFT`.
- **Data safety:** the attention item remains open; no conflict, media or work record is marked resolved without an auditable reason.
- **Office sees:** the same inline guard on the attention detail; failed attempt is logged with ref.
- **Priority / owner:** P0 · T09 · refs REC-09, A§21 Needs attention, A§14.4.
- **Test:** API/component test: resolving a rejected mutation or media attention item without required resolution data returns `GUARD_RESOLUTION_REQUIRED`, preserves the draft note and keeps the item open.

## 10. ERP backbone (EC-ERP)

#### EC-ERP-01 · Season dates overlap
- **When:** an admin creates or edits a season whose dates overlap another season for the same crop; a null crop overlaps the whole farm.
- **Detected by:** `SEASON_OVERLAP` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** inline on seasons form. pt-BR: "Safras com datas sobrepostas" / "Nada foi salvo. Ajuste as datas ou escolha uma cultura diferente." en: "Season dates overlap" / "Nothing was saved. Adjust the dates or choose a different crop."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** existing seasons and current-season setting remain unchanged.
- **Office sees:** validation ref in logs only.
- **Priority / owner:** P0 · T04 · refs ERP-02, A§8 Seasons, A§6.4 Current season.
- **Test:** core/API test: same-crop overlap fails with `SEASON_OVERLAP`; different crops can overlap; null crop blocks whole-farm overlap.

#### EC-ERP-02 · Cost has no season
- **When:** a WO, rental or manual cost would be saved without a season and no current season can be found.
- **Detected by:** `COST_SEASON_MISSING` (server, new, HTTP 409) — runtime check for this case.
- **User sees:** banner/dialog. pt-BR: "Defina uma safra para este custo" / "O custo não foi lançado. Escolha uma safra para manter os relatórios corretos." en: "Choose a season for this cost" / "The cost was not posted. Pick a season to keep reports correct."
- **Recovery:** `FIX`, `ALT`.
- **Data safety:** the source WO or rental stays unchanged; no cost roll-up is written without a season.
- **Office sees:** Needs attention item if the missing season came from an automated completion.
- **Priority / owner:** P0 · T09 · refs ERP-03, ERP-04, A§6.4 Costs.
- **Test:** core test: completion with no current season creates no cost row and exposes a fixable season prompt.

#### EC-ERP-03 · Plot shape or area invalid
- **When:** a plot has negative/zero area, impossible coordinates, invalid centroid or invalid GeoJSON boundary.
- **Detected by:** `PLOT_GEOMETRY_INVALID` (server, new, HTTP 422) — runtime check for this case.
- **User sees:** inline on plot form. pt-BR: "Revise o talhão no mapa" / "Nada foi salvo. Ajuste a área ou marque o ponto correto." en: "Review the plot on the map" / "Nothing was saved. Adjust the area or mark the correct point."
- **Recovery:** `FIX`, `ALT`.
- **Data safety:** the previous plot geometry remains active until a valid save.
- **Office sees:** validation ref only.
- **Priority / owner:** P0 · T04 · refs ERP-01, A§5.3 Plot, A§14.1 Sites.
- **Test:** contract/API test: invalid coordinates and area fail; valid centroid-only plot passes for P0.

#### EC-ERP-04 · Site location missing
- **When:** a user needs map-based selection or routing but the site has no latitude/longitude.
- **Detected by:** `SITE_COORDS_MISSING` (client) — client from site DTO.
- **User sees:** inline/banner. pt-BR: "Local sem ponto no mapa" / "Os dados do local estão seguros. Marque o ponto para usar mapa e distância." en: "Site has no map point" / "The site data is safe. Add a point to use maps and distance."
- **Recovery:** `FIX`, `ALT`.
- **Data safety:** existing address and records remain unchanged; only map features degrade.
- **Office sees:** site page warning and any later site update in audit timeline.
- **Priority / owner:** P0 · T04 · refs ERP-01, OPS-07, A§14.2 SitePicker.
- **Test:** component test: site without coords shows Add point and keeps non-map fields editable.

#### EC-ERP-05 · Money value needs cents
- **When:** a money or quantity input cannot be parsed safely, has more than two cent digits, or would round differently from stored cents.
- **Detected by:** `VALIDATION_FAILED` (server, HTTP 422, context `money`) — server route and client locale parser.
- **User sees:** inline. pt-BR: "Revise o valor" / "Nada foi salvo. Use reais e centavos, por exemplo R$ 1.234,56." en: "Review the amount" / "Nothing was saved. Use reais and cents, for example R$ 1,234.56."
- **Recovery:** `FIX`, `RETRY`.
- **Data safety:** integer cents are not changed until the value is unambiguous.
- **Office sees:** validation ref only.
- **Priority / owner:** P0 · T04 · refs PLT-15, ERP-03, A§14.4 Money.
- **Test:** unit/component test: `1.234,56` parses; ambiguous thousands and 3 decimals show inline error.

#### EC-ERP-06 · Season still has open work
- **When:** an admin closes a season that still has open WOs, active rentals or pending costs.
- **Detected by:** `SEASON_OPEN_WORK_WARNING` (client) — runtime check for this case.
- **User sees:** dialog. pt-BR: "Ainda há trabalho nesta safra" / "Nada foi fechado ainda. Revise os itens abertos e confirme se quiser fechar mesmo assim." en: "This season still has work" / "Nothing is closed yet. Review open items and confirm if you still want to close it."
- **Recovery:** `FIX` (open blocking list), `ALT` (close anyway with note).
- **Data safety:** the season stays unchanged until the admin confirms; open work keeps its current season link and audit trail.
- **Office sees:** warning list grouped by WO, rental and cost count, plus audit note if closed anyway.
- **Priority / owner:** P0 · T04 · refs ERP-02, ERP-03, A§8 Seasons.
- **Test:** core/API test: season with open WO/rental returns warning data, allows explicit close with note, and keeps item links auditable.

## 11. Public site (EC-SITE)

#### EC-SITE-01 · Unsupported language link
- **When:** a visitor opens a locale prefix that the site does not support, such as `/es` before Spanish ships.
- **Detected by:** `SITE_LOCALE_UNSUPPORTED` (client) — site router.
- **User sees:** redirect/banner. pt-BR: "Idioma ainda não disponível" / "Você foi levado para Português. O conteúdo continua disponível." en: "Language not available yet" / "We took you to English. The content is still available."
- **Recovery:** `ALT`, `FALLBACK`.
- **Data safety:** static site only; no visitor data is stored.
- **Office sees:** privacy-friendly aggregate 404/redirect count if analytics is enabled.
- **Priority / owner:** P0 · T19 · refs SITE-03, A§22.
- **Test:** Playwright: unsupported locale redirects to resolved locale and preserves path when possible.

#### EC-SITE-02 · Site page not found
- **When:** a visitor opens an unknown public-site URL.
- **Detected by:** `SITE_PAGE_NOT_FOUND` (client) — site router.
- **User sees:** 404 page. pt-BR: "Página não encontrada" / "Nada foi perdido. Use a busca de ajuda ou volte para a página inicial." en: "Page not found" / "Nothing was lost. Use help search or go back home."
- **Recovery:** `ALT`, `FALLBACK`.
- **Data safety:** static site only; no account or app data is affected.
- **Office sees:** aggregate 404 path in site analytics, no cookies.
- **Priority / owner:** P0 · T19 · refs SITE-01, SITE-05, A§22.
- **Test:** Playwright: unknown page returns localized 404 with Home, Help and Contact links.

#### EC-SITE-03 · WhatsApp did not open
- **When:** a desktop visitor clicks WhatsApp and the browser cannot hand off to WhatsApp or `wa.me` is blocked.
- **Detected by:** `WHATSAPP_UNAVAILABLE` (client) — client after visibility/fallback timeout.
- **User sees:** fallback panel. pt-BR: "WhatsApp não abriu" / "Copie o telefone público da AgroRende ou envie e-mail. Nenhum dado foi enviado automaticamente." en: "WhatsApp did not open" / "Copy AgroRende's public phone or send an email. No data was sent automatically."
- **Recovery:** `ALT` (copy AgroRende public phone/email).
- **Data safety:** only the prefilled message text is offered; nothing is submitted by the site.
- **Office sees:** nothing unless the visitor contacts the team.
- **Priority / owner:** P0 · T19 · refs SITE-04, A§22.
- **Test:** component test: blocked WhatsApp path shows copy number and email fallback without Ask-office wording.

#### EC-SITE-04 · Email app did not open
- **When:** a visitor clicks `mailto:` and no mail client is configured.
- **Detected by:** `MAIL_CLIENT_UNAVAILABLE` (client) — client after fallback timeout or explicit copy action.
- **User sees:** fallback panel. pt-BR: "E-mail não abriu" / "Copie o e-mail público da AgroRende e escreva pelo app que preferir. Nada foi enviado ainda." en: "Email did not open" / "Copy AgroRende's public email and write from any app you prefer. Nothing was sent yet."
- **Recovery:** `ALT` (copy public email/phone).
- **Data safety:** the site does not store or send the message.
- **Office sees:** nothing unless the visitor sends an email manually.
- **Priority / owner:** P0 · T19 · refs SITE-04, SITE-05.
- **Test:** component test: mail fallback exposes copy email and subject text without Ask-office wording.

#### EC-SITE-05 · Site works without JavaScript
- **When:** JavaScript is disabled or fails before hydration.
- **Detected by:** `JS_DISABLED` (client) — progressive enhancement.
- **User sees:** static page/no-script note. pt-BR: "Você pode ler sem JavaScript" / "Os links principais continuam funcionando. Alguns atalhos ficam mais simples." en: "You can read without JavaScript" / "Main links still work. Some shortcuts are simpler."
- **Recovery:** `FALLBACK`, `ALT`.
- **Data safety:** static site only; no account data is present.
- **Office sees:** nothing.
- **Priority / owner:** P0 · T19 · refs SITE-05, SITE-06, A§22.
- **Test:** Playwright with JavaScript disabled: home, pricing, help, legal and 404 pages are readable and links work.

#### EC-SITE-06 · Slow connection, lighter page
- **When:** the site detects slow 3G, image load failures or the browser saves data.
- **Detected by:** `SITE_SLOW_NETWORK` (client) — client and image error handlers.
- **User sees:** lightweight fallback. pt-BR: "Carregando versão leve" / "O texto aparece primeiro. Imagens podem entrar depois sem travar a página." en: "Loading a lighter version" / "Text appears first. Images may load later without blocking the page."
- **Recovery:** `FALLBACK`, `RETRY`.
- **Data safety:** static site only; no visitor data is stored.
- **Office sees:** Lighthouse/field performance aggregate if analytics is enabled.
- **Priority / owner:** P0 · T19 · refs SITE-05, A§22 Images.
- **Test:** Lighthouse/Playwright throttled run: text and CTAs appear before non-critical images; no layout-blocking spinner.

#### EC-SITE-07 · Help code unknown
- **When:** a user opens `/ajuda/erros/<code>` for a code that is not in `ERROR_META`.
- **Detected by:** `SITE_ERROR_CODE_UNKNOWN` (client) — site router/build data.
- **User sees:** help page. pt-BR: "Código de ajuda não encontrado" / "Procure o código novamente ou fale com a AgroRende." en: "Help code not found" / "Search for the code again or contact AgroRende."
- **Recovery:** `ALT` (help search, copy AgroRende public phone/email).
- **Data safety:** help pages are read-only and cannot change app data.
- **Office sees:** aggregate unknown-code path if analytics is enabled.
- **Priority / owner:** P1 · T19 · refs REC-15, SITE-01, A§22 Help pages.
- **Test:** Playwright: unknown help-code page returns localized guidance and links to the help index/contact with AgroRende public phone/email fallback.

## 12. Code index

| Code | Kind | HTTP | Retryable | Default surface | Recovery patterns | Entries |
|---|---|---:|:---:|---|---|---|
| `ACCOUNT_DELETE_PENDING_DATA` | client | — | no | sheet | `RETRY`, `FIX` | EC-PLT-42 |
| `ACCOUNT_DISABLED` | server (new) | 403 | no | full screen | `OFFICE`, `DIAG`, `FALLBACK` | EC-PLT-03 |
| `ACCOUNT_IN_OTHER_ORG` | server (new) | 409 | no | full screen | `FIX`, `OFFICE` | EC-PLT-37 |
| `ACCOUNT_NOT_INVITED` | server (new) | 403 | no | full screen | `FIX`, `OFFICE` | EC-PLT-34 |
| `ALERTS_COLLAPSED` | client | — | no | alerts panel | `FALLBACK`, `FIX` | EC-OPS-21 |
| `ALREADY_RESOLVED` | server (new) | 409 | no | toast/dialog | `FALLBACK`, `RETRY` | EC-OPS-23 |
| `APP_UPDATE_REQUIRED` | server (new) | 426 | no | full screen | `UPDATE`, `DRAFT`, `OFFICE` | EC-PLT-19 |
| `ASSET_DOUBLE_BOOKED` | server | 409 | no | inline | `FIX`, `OFFICE` | EC-RN-01, EC-RN-32 |
| `ASSET_HAS_CRITICAL_REPORT` | server | 409 | no | inline | `FIX`, `OFFICE` | EC-RN-36 |
| `ASSET_LOOKUP_UNAVAILABLE` | client | — | no | sheet | `ALT`, `FALLBACK`, `OFFICE` | EC-PLT-26 |
| `ASSET_NOT_OPERATIONAL` | server | 409 | no | inline | `FIX`, `OFFICE` | EC-RN-35 |
| `ASSET_NOT_RENTABLE` | server | 409 | no | inline | `FIX`, `OFFICE` | EC-RN-02 |
| `ASSET_QR_OTHER_ORG` | client | — | no | sheet | `ALT`, `OFFICE` | EC-PLT-25 |
| `ASSET_REPAIR_ALREADY_OPEN` | server (new) | 409 | no | web dialog | `ALT`, `FIX`, `HANDOFF` | EC-FR-15 |
| `ASSIGNEE_UNAVAILABLE` | server (new) | 409 | no | assign dialog | `FIX`, `RETRY` | EC-OPS-22 |
| `BATTERY_BACKGROUND_RESTRICTED` | client | — | no | sheet | `SETTINGS`, `FALLBACK`, `DIAG` | EC-PLT-15 |
| `BROWSER_OFFLINE` | client | — | no | banner | `FALLBACK`, `RETRY`, `DRAFT` | EC-OPS-14 |
| `BULK_PARTIAL_FAILURE` | client | — | no | dialog | `RETRY`, `FIX`, `ALT` | EC-OPS-07 |
| `CAPTIVE_PORTAL` | client | — | yes | banner | `ALT`, `AUTO`, `FALLBACK` | EC-SYN-05 |
| `CONFLICT` | server | 409 | no | dialog | `FIX`, `DRAFT`, `RETRY` | EC-OPS-05 |
| `COST_SEASON_MISSING` | server (new) | 409 | no | banner/dialog | `FIX`, `ALT` | EC-ERP-02 |
| `CSV_ENCODING_UNSUPPORTED` | server (new) | 422 | no | import screen | `FIX`, `RETRY`, `OFFICE` | EC-OPS-08 |
| `CSV_FORMAT_UNSUPPORTED` | server (new) | 422 | no | import screen | `FIX`, `RETRY` | EC-OPS-09 |
| `CUSTOMER_INCOMPLETE` | server | 422 | no | inline | `FIX`, `DRAFT`, `OFFICE` | EC-RN-03 |
| `DEVICE_CLOCK_SKEWED` | client | — | no | sheet | `SETTINGS`, `FALLBACK` | EC-PLT-17 |
| `DEVICE_MEMORY_LOW` | client | — | no | sheet | `DRAFT`, `RETRY`, `ALT`, `DIAG` | EC-PLT-18 |
| `DEVICE_STORAGE_FULL` | client | — | no | full screen | `SETTINGS`, `RETRY`, `DRAFT`, `ALT`, `OFFICE` | EC-PLT-14 |
| `DEVICE_UNSYNCED_STALE` | client | — | yes | Home/Sync Center banner | `RETRY`, `DIAG`, `OFFICE` | EC-SYN-29 |
| `DIAGNOSTICS_SEND_FAILED` | client | — | yes | banner | `AUTO`, `RETRY`, `OFFICE` | EC-PLT-31 |
| `DIAGNOSTICS_UNAVAILABLE` | server (new) | 410 | no | detail panel | `FALLBACK`, `DIAG`, `OFFICE` | EC-OPS-24 |
| `EXPORT_JOB_STARTED` | client | — | yes | toast plus notification entry | `AUTO`, `FALLBACK` | EC-OPS-11 |
| `FIRST_LOGIN_ONLINE_REQUIRED` | client | — | no | full screen | `SETTINGS`, `OFFICE` | EC-PLT-01 |
| `FIRST_SYNC_LARGE` | client | — | yes | progress screen | `AUTO`, `RETRY`, `FALLBACK` | EC-SYN-11 |
| `FORBIDDEN` | server | 403 | no | full screen | `ALT`, `OFFICE` | EC-OPS-03 |
| `GPS_UNAVAILABLE` | client | — | no | banner | `ALT`, `SETTINGS`, `RETRY` | EC-PLT-29 |
| `GUARD_AFTER_PHOTO_REQUIRED` | server | 409 | no | inline | `FIX`, `DRAFT` | EC-WO-10 |
| `GUARD_CHECKIN_INCOMPLETE` | server | 409 | no | banner | `FIX`, `DRAFT`, `OFFICE` | EC-RN-29 |
| `GUARD_CHECKLIST_INCOMPLETE` | server | 409 | no | inline + summary | `FIX`, `DRAFT` | EC-WO-11 |
| `GUARD_CHECKOUT_INCOMPLETE` | server | 409 | no | banner | `FIX`, `DRAFT`, `OFFICE` | EC-RN-14 |
| `GUARD_RESOLUTION_REQUIRED` | server | 409 | no | inline | `FIX`, `DRAFT` | EC-OPS-30 |
| `GUARD_SIGNATURE_REQUIRED` | server | 409 | no | sheet | `FIX`, `ALT`, `HANDOFF`, `OFFICE` | EC-RN-37 |
| `IMPORT_ROW_ERRORS` | server (new) | 422 | no | import review | `FIX`, `DRAFT`, `RETRY` | EC-OPS-10 |
| `INBOUND_RENTAL_INCOMPLETE` | server (new) | 422 | no | inline | `FIX`, `DRAFT`, `OFFICE` | EC-RN-34 |
| `INTERNAL` | server | 500 | yes | banner | `AUTO`, `RETRY`, `FALLBACK`, `DIAG` | EC-SYN-04 |
| `INVALID_CREDENTIALS` | server (new) | 401 | no | inline | `FIX`, `OFFICE` | EC-PLT-02 |
| `INVALID_LOCALE_NUMBER` | client | — | no | inline | `FIX` | EC-PLT-23 |
| `INVALID_TRANSITION` | server | 409 | no | banner | `FALLBACK`, `RETRY` | EC-SYN-34 |
| `INVITE_EMAIL_MISMATCH` | server (new) | 403 | no | full screen | `FIX`, `OFFICE` | EC-PLT-36 |
| `INVITE_EXPIRED` | server (new) | 410 | no | sheet | `OFFICE`, `FIX` | EC-PLT-35 |
| `JS_DISABLED` | client | — | no | static page/no-script note | `FALLBACK`, `ALT` | EC-SITE-05 |
| `LAST_ADMIN` | server (new) | 409 | no | sheet | `FIX` | EC-OPS-28 |
| `LOCALE_FALLBACK_USED` | client | — | no | banner | `FALLBACK`, `SETTINGS` | EC-PLT-22 |
| `LOCAL_DB_REPAIR_REQUIRED` | client | — | yes | full screen | `RETRY`, `DIAG`, `HANDOFF`, `OFFICE` | EC-SYN-13 |
| `LOCAL_MEDIA_CORRUPT` | client | — | no | Sync Center sheet | `ALT`, `FIX`, `DRAFT` | EC-SYN-18 |
| `LOCAL_MEDIA_MISSING` | client | — | no | Sync Center sheet | `ALT`, `FIX`, `OFFICE` | EC-SYN-17 |
| `LOCAL_MIGRATION_FAILED` | client | — | yes | full screen | `RETRY`, `UPDATE`, `DIAG`, `OFFICE` | EC-SYN-12 |
| `LOCATION_BUFFER_TRIMMED` | client | — | yes | duty banner | `AUTO`, `HANDOFF`, `FALLBACK` | EC-SYN-28 |
| `LOCATION_CONSENT_REQUIRED` | server | 409 | no | sheet | `FIX`, `FALLBACK`, `OFFICE` | EC-PLT-12 |
| `LOGOUT_PENDING_DATA` | client | — | no | sheet | `DRAFT`, `FALLBACK`, `OFFICE` | EC-PLT-09 |
| `MAIL_CLIENT_UNAVAILABLE` | client | — | no | fallback panel | `ALT` | EC-SITE-04 |
| `MAP_TILES_UNAVAILABLE` | client | — | no | map panel banner | `RETRY`, `FALLBACK` | EC-OPS-18 |
| `MEDIA_CAPTURE_FAILED` | client | — | no | sheet | `RETRY`, `ALT`, `DRAFT` | EC-SYN-14 |
| `MEDIA_DEVICE_STORAGE_LOW` | client | — | no | full screen or sheet | `SETTINGS`, `ALT`, `DRAFT` | EC-SYN-15 |
| `MEDIA_LOCKED` | server | 409 | no | Sync Center sheet | `FALLBACK`, `OFFICE` | EC-SYN-32 |
| `MEDIA_NOT_IN_STORAGE` | server | 404 | no | Sync Center sheet | `DIAG`, `OFFICE`, `FALLBACK` | EC-SYN-33 |
| `MEDIA_PART_MISSING` | server (new) | 409 | yes | media queue row | `AUTO`, `RETRY` | EC-SYN-24 |
| `MEDIA_PENDING_STALE` | client | — | no | Sync Center card | `RETRY`, `DIAG`, `HANDOFF`, `OFFICE` | EC-SYN-27 |
| `MEDIA_TOO_LARGE` | server | 413 | no | Sync Center sheet | `FIX`, `ALT`, `OFFICE` | EC-SYN-21 |
| `MEDIA_TYPE_MISMATCH` | server (new) | 422 | no | Sync Center sheet | `ALT`, `FIX`, `OFFICE` | EC-SYN-23 |
| `METER_READING_JUMP` | server (new) | 409 | no | sheet | `FIX`, `ALT`, `OFFICE` | EC-WO-14, EC-RN-09, EC-RN-26 |
| `METER_READING_LOWER` | server (new) | 409 | no | sheet | `FIX`, `ALT`, `OFFICE` | EC-WO-14, EC-RN-09, EC-RN-26 |
| `NAV_APP_MISSING` | client | — | no | sheet | `ALT`, `OFFICE` | EC-WO-06 |
| `NAV_DESTINATION_DOUBTFUL` | client | — | no | sheet | `ALT`, `OFFICE` | EC-WO-08 |
| `NETWORK_RESTRICTED` | client | — | no | banner | `SETTINGS`, `RETRY`, `FALLBACK` | EC-PLT-16 |
| `NOT_FOUND` | server | 404 | no | full screen | `ALT`, `RESTORE`, `OFFICE` | EC-OPS-04 |
| `OAUTH_CANCELLED` | client | — | no | inline | `RETRY` | EC-PLT-41 |
| `OAUTH_PROVIDER_ERROR` | server (new) | 502 | yes | inline | `RETRY`, `FALLBACK` | EC-PLT-39 |
| `OAUTH_STATE_EXPIRED` | server (new) | 400 | no | inline | `RETRY` | EC-PLT-38 |
| `OFFICE_CONTACT_MISSING` | client | — | no | sheet | `DIAG`, `FALLBACK`, `HANDOFF`, `FIX`, `OFFICE` | EC-PLT-32, EC-OPS-25 |
| `OFFICE_ROLE_REQUIRED` | server (new) | 403 | no | full screen | `FALLBACK`, `OFFICE` | EC-OPS-27 |
| `OFFLINE_SEARCH_NO_RESULTS` | client | — | no | empty state | `FIX`, `ALT`, `FALLBACK` | EC-PLT-28 |
| `OPERATOR_STALE` | client | — | yes | marker label and side-panel banner | `FALLBACK`, `AUTO`, `OFFICE` | EC-OPS-20 |
| `OPS_NO_LIVE_OPERATORS` | client | — | no | empty state | `FALLBACK`, `RETRY` | EC-OPS-19 |
| `ORG_SUSPENDED` | server (new) | 403 | yes | banner | `FALLBACK`, `OFFICE`, `AUTO` | EC-PLT-40, EC-OPS-29 |
| `OTA_UPDATE_FAILED` | client | — | no | sheet | `RETRY`, `FALLBACK`, `UPDATE`, `DIAG` | EC-PLT-20 |
| `OUTBOX_BACKLOG` | client | — | yes | banner + Sync Center card | `AUTO`, `RETRY`, `DIAG`, `OFFICE` | EC-SYN-01 |
| `OUTBOX_ITEM_STUCK` | client | — | yes | Sync Center sheet | `RETRY`, `DIAG`, `OFFICE` | EC-SYN-02 |
| `PASSWORD_CHANGE_REQUIRED` | server (new) | 403 | no | sheet | `FIX`, `DRAFT`, `OFFICE` | EC-PLT-04 |
| `PDF_SHARE_UNAVAILABLE` | client | — | no | sheet | `FALLBACK`, `ALT`, `OFFICE` | EC-PLT-30 |
| `PERMISSION_LOCATION_LIMITED` | client | — | no | banner | `SETTINGS`, `ALT`, `FALLBACK` | EC-PLT-11 |
| `PERMISSION_MEDIA_BLOCKED` | client | — | no | sheet | `SETTINGS`, `ALT`, `OFFICE` | EC-PLT-10 |
| `PERMISSION_NOTIFICATIONS_OFF` | client | — | no | banner | `SETTINGS`, `FALLBACK`, `OFFICE` | EC-PLT-13 |
| `PLOT_GEOMETRY_INVALID` | server (new) | 422 | no | inline on plot form | `FIX`, `ALT` | EC-ERP-03 |
| `PULL_FAILED` | client | — | yes | banner | `AUTO`, `RETRY`, `FALLBACK` | EC-SYN-10 |
| `PUSH_PARTIAL_RETRY` | client | — | yes | Sync Center row state | `AUTO`, `RETRY` | EC-SYN-03 |
| `RATE_LIMITED` | server | 429 | yes | Sync Center banner | `AUTO`, `RETRY`, `OFFICE` | EC-SYN-07, EC-OPS-01 |
| `REALTIME_DISCONNECTED` | client | — | yes | banner | `AUTO`, `RETRY`, `FALLBACK` | EC-OPS-17 |
| `RECORD_IN_USE` | server (new) | 409 | no | dialog | `ALT`, `RESTORE`, `OFFICE` | EC-OPS-12 |
| `REFRESH_REUSED` | server | 401 | no | full screen | `REAUTH`, `DRAFT`, `OFFICE` | EC-PLT-07 |
| `RENTAL_ACCESSORIES_MISSING` | client | — | no | inline | `FIX`, `DRAFT`, `OFFICE` | EC-RN-10 |
| `RENTAL_ACCESSORY_RETURN_MISSING` | client | — | no | inline | `FIX`, `DRAFT`, `OFFICE` | EC-RN-22 |
| `RENTAL_ASSET_MISMATCH` | server | 409 | no | sheet | `ALT`, `FIX`, `OFFICE` | EC-RN-06 |
| `RENTAL_BILLING_DOCUMENT_FAILED` | server (new) | 502 | yes | sheet | `RETRY`, `HANDOFF`, `OFFICE` | EC-RN-33 |
| `RENTAL_BREAKDOWN_REPORTED` | client | — | no | sheet | `ALT`, `OFFICE`, `DRAFT` | EC-RN-19 |
| `RENTAL_CHARGES_UPDATED` | server (new) | 409 | no | sheet/banner | `FIX`, `FALLBACK`, `HANDOFF`, `OFFICE` | EC-RN-28 |
| `RENTAL_DAMAGE_COST_UNKNOWN` | client | — | no | inline | `FIX`, `HANDOFF` | EC-RN-25 |
| `RENTAL_DAMAGE_DISPUTED` | client | — | no | sheet | `FIX`, `HANDOFF`, `OFFICE` | EC-RN-24 |
| `RENTAL_DAMAGE_MATCH_UNCLEAR` | client | — | no | sheet | `FIX`, `HANDOFF`, `OFFICE` | EC-RN-23 |
| `RENTAL_DAMAGE_REPORT_FAILED` | server (new) | 503 | yes | banner | `AUTO`, `HANDOFF`, `OFFICE` | EC-RN-31 |
| `RENTAL_DATES_INVALID` | server (new) | 422 | no | inline | `FIX`, `DRAFT` | EC-RN-04 |
| `RENTAL_DIFFERENT_AGENT_CHECKIN` | client | — | no | banner | `FIX`, `OFFICE` | EC-RN-30 |
| `RENTAL_DOCUMENT_UNAVAILABLE` | client | — | no | sheet | `RETRY`, `FALLBACK`, `OFFICE` | EC-RN-15 |
| `RENTAL_DRAFT_INTERRUPTED` | client | — | no | banner | `DRAFT`, `UNDO` | EC-RN-16 |
| `RENTAL_EARLY_RETURN` | client | — | no | sheet | `FIX`, `DRAFT`, `OFFICE` | EC-RN-18 |
| `RENTAL_FUEL_READING_INVALID` | client | — | no | inline | `FIX`, `DRAFT` | EC-RN-27 |
| `RENTAL_LOCATION_CHANGED` | client | — | no | sheet | `FIX`, `OFFICE` | EC-RN-20 |
| `RENTAL_NOT_ACTIVE` | server | 409 | no | banner | `HANDOFF`, `DRAFT`, `OFFICE` | EC-RN-21 |
| `RENTAL_NOT_FOUND` | server | 404 | no | banner | `FALLBACK`, `OFFICE` | EC-RN-38 |
| `RENTAL_NOT_RESERVED` | server | 409 | no | banner | `HANDOFF`, `DRAFT`, `OFFICE` | EC-RN-07 |
| `RENTAL_OVERDUE` | client | — | no | banner | `ALT`, `OFFICE` | EC-RN-17 |
| `RENTAL_PHOTO_UNUSABLE` | client | — | no | inline | `FIX`, `ALT`, `DRAFT` | EC-RN-08 |
| `RENTAL_SAFETY_BRIEFING_MISSING` | client | — | no | inline | `FIX`, `DRAFT` | EC-RN-11 |
| `RENTAL_SIGNER_UNAVAILABLE` | client | — | no | sheet | `RETRY`, `ALT`, `DRAFT`, `OFFICE` | EC-RN-13 |
| `RENTAL_SITE_MISMATCH` | server (new) | 409 | no | sheet | `ALT`, `FIX`, `OFFICE` | EC-RN-05 |
| `RENTAL_TERMS_OLDER_ACCEPTED` | client | — | no | banner after send | `HANDOFF`, `FALLBACK`, `OFFICE` | EC-RN-12 |
| `REPORT_ASSET_ATTENTION` | client | — | no | sheet | `ALT`, `HANDOFF`, `OFFICE` | EC-FR-04 |
| `REPORT_ASSET_BUSY` | client | — | no | banner after send/apply | `HANDOFF`, `OFFICE` | EC-FR-13 |
| `REPORT_DETAILS_INCOMPLETE` | client | — | no | inline + summary | `FIX`, `DRAFT` | EC-FR-09 |
| `REPORT_DRAFT_RESTORED` | client | — | no | banner | `DRAFT`, `ALT`, `UNDO` | EC-FR-12 |
| `REPORT_DUPLICATE_HINT` | client | — | no | banner | `ALT`, `DRAFT` | EC-FR-16 |
| `REPORT_DUPLICATE_MERGED` | client | — | no | notification + report status | `FALLBACK`, `OFFICE` | EC-FR-17 |
| `REPORT_EVIDENCE_REQUIRED` | client | — | no | inline | `FIX`, `DRAFT` | EC-FR-05 |
| `REPORT_LOCATION_WEAK` | client | — | no | banner on Location/Review | `ALT`, `SETTINGS`, `OFFICE` | EC-FR-10 |
| `REPORT_LOCKED` | server | 409 | no | banner | `FALLBACK`, `OFFICE` | EC-FR-18 |
| `REPORT_MACHINE_CHANGED` | client | — | no | sheet | `ALT`, `DRAFT` | EC-FR-03 |
| `REPORT_MACHINE_NOT_FOUND` | client | — | no | inline + sheet | `ALT`, `OFFICE` | EC-FR-01 |
| `REPORT_MARKED_FOR_REPAIR_STATUS` | client | — | no | notification + report status | `FALLBACK`, `OFFICE` | EC-FR-14 |
| `REPORT_MEDIA_METADATA_MISSING` | client | — | no | sheet | `ALT`, `FIX` | EC-FR-08 |
| `REPORT_NO_PLOTS_AVAILABLE` | client | — | no | inline empty state | `FALLBACK`, `FIX` | EC-FR-11 |
| `REPORT_UNREGISTERED_MACHINE_INCOMPLETE` | client | — | no | inline | `FIX`, `DRAFT` | EC-FR-02 |
| `REPORT_VIDEO_LIMIT_EXCEEDED` | client | — | no | sheet | `FIX`, `ALT`, `UNDO` | EC-FR-06 |
| `RESET_LINK_EXPIRED` | server (new) | 410 | no | sheet | `RETRY`, `OFFICE` | EC-PLT-05 |
| `RESET_REQUIRED` | server | 409 | yes | sheet | `FALLBACK`, `HANDOFF`, `OFFICE`, `AUTO`, `RETRY` | EC-PLT-08, EC-SYN-08 |
| `SAME_USER_MULTIPLE_DEVICES` | client | — | no | Sync Center info card | `ALT`, `OFFICE`, `FALLBACK` | EC-SYN-31 |
| `SCAN_UNREADABLE` | client | — | no | sheet | `ALT`, `RETRY`, `OFFICE` | EC-PLT-24 |
| `SCREEN_CRASHED` | client | — | no | full screen | `RETRY`, `FALLBACK`, `DRAFT`, `DIAG` | EC-PLT-21 |
| `SEASON_OPEN_WORK_WARNING` | client | — | no | dialog | `FIX`, `ALT` | EC-ERP-06 |
| `SEASON_OVERLAP` | server (new) | 409 | no | inline on seasons form | `FIX`, `RETRY` | EC-ERP-01 |
| `SERIAL_OCR_FAILED` | client | — | no | sheet | `ALT`, `RETRY`, `OFFICE` | EC-PLT-27 |
| `SHARED_DEVICE_PENDING_DATA` | client | — | no | sheet | `REAUTH`, `FALLBACK`, `OFFICE` | EC-PLT-33 |
| `SITE_COORDS_MISSING` | client | — | no | inline/banner | `FIX`, `ALT` | EC-ERP-04 |
| `SITE_ERROR_CODE_UNKNOWN` | client | — | no | help page | `ALT` | EC-SITE-07 |
| `SITE_LOCALE_UNSUPPORTED` | client | — | no | redirect/banner | `ALT`, `FALLBACK` | EC-SITE-01 |
| `SITE_PAGE_NOT_FOUND` | client | — | no | 404 page | `ALT`, `FALLBACK` | EC-SITE-02 |
| `SITE_SLOW_NETWORK` | client | — | yes | lightweight fallback | `FALLBACK`, `RETRY` | EC-SITE-06 |
| `SLOW_CONNECTION` | client | — | yes | banner + media queue hint | `AUTO`, `ALT`, `FALLBACK` | EC-SYN-06 |
| `STORAGE_FULL` | server | 507 | yes | Sync Center banner | `AUTO`, `RETRY`, `OFFICE` | EC-SYN-22 |
| `TEMPLATE_VERSION_IN_USE` | server (new) | 409 | no | publish dialog | `ALT`, `FALLBACK` | EC-OPS-13 |
| `THUMBNAIL_FAILED` | client | — | yes | small media row warning | `AUTO`, `RETRY`, `FALLBACK` | EC-SYN-26 |
| `TOKEN_EXPIRED` | server | 401 | no | banner | `REAUTH`, `FALLBACK`, `DRAFT`, `OFFICE` | EC-PLT-06, EC-OPS-02 |
| `UNAUTHENTICATED` | server | 401 | no | full screen | `REAUTH`, `DRAFT`, `OFFICE` | EC-PLT-43 |
| `UNKNOWN_MUTATION` | server | 422 | no | Sync Center conflict sheet | `UPDATE`, `DIAG`, `OFFICE` | EC-SYN-35 |
| `UNSUPPORTED_BROWSER` | client | — | no | full screen | `UPDATE`, `ALT`, `OFFICE` | EC-OPS-15 |
| `UPLOAD_FILE_INVALID` | client | — | no | inline near the file field | `FIX`, `RETRY` | EC-OPS-16 |
| `UPLOAD_INTERRUPTED` | client | — | yes | media queue row | `AUTO`, `RETRY`, `FALLBACK` | EC-SYN-19 |
| `UPLOAD_RESUME_AFTER_RESTART` | client | — | yes | Sync Center info row | `AUTO`, `RETRY` | EC-SYN-30 |
| `UPLOAD_URL_EXPIRED` | server (new) | 410 | yes | hidden auto state; only row detail if repeated | `AUTO`, `RETRY` | EC-SYN-20 |
| `VALIDATION_FAILED` | server | 422 | no | Sync Center conflict sheet | `UPDATE`, `RETRY`, `OFFICE`, `FIX` | EC-SYN-09, EC-OPS-06, EC-OPS-08, EC-OPS-26, EC-ERP-05 |
| `VIDEO_TOO_LONG` | client | — | no | inline/sheet at evidence picker | `FIX`, `ALT`, `DRAFT` | EC-SYN-16 |
| `VOICE_NOTE_FAILED` | client | — | no | sheet | `RETRY`, `ALT`, `SETTINGS` | EC-FR-07 |
| `WHATSAPP_UNAVAILABLE` | client | — | no | fallback panel | `ALT` | EC-SITE-03 |
| `WIFI_ONLY_MEDIA_WAITING` | client | — | no | Sync Center banner | `ALT`, `RETRY`, `OFFICE` | EC-SYN-25 |
| `WO_ALREADY_VERIFIED` | server (new) | 409 | no | conflict banner | `FALLBACK`, `HANDOFF`, `OFFICE` | EC-WO-15 |
| `WO_ARRIVAL_PROMPT_MISMATCH` | client | — | no | sheet | `ALT`, `OFFICE` | EC-WO-21 |
| `WO_ASSET_RETIRED` | server (new) | 409 | no | banner/dialog | `HANDOFF`, `FALLBACK`, `OFFICE` | EC-WO-16 |
| `WO_ASSIGNED_STALE` | client | — | yes | banner + job card | `FALLBACK`, `AUTO` | EC-WO-01 |
| `WO_ASSIGNEE_OFF_DUTY` | server (new) | 409 | no | web dialog | `FIX`, `ALT` | EC-WO-19 |
| `WO_CANCELLED` | server | 409 | no | conflict banner | `FALLBACK`, `OFFICE` | EC-WO-03 |
| `WO_CHANGED_STALE` | client | — | no | banner | `FIX`, `FALLBACK` | EC-WO-05 |
| `WO_CONCURRENT_TECHNICIAN` | client | — | no | banner | `OFFICE`, `FALLBACK` | EC-WO-17 |
| `WO_DECLINE_REASON_REQUIRED` | client | — | no | inline | `FIX`, `DRAFT` | EC-WO-02 |
| `WO_DESTINATION_MISSING` | server (new) | 409 | no | sheet | `OFFICE`, `ALT` | EC-WO-07 |
| `WO_PART_NOT_IN_VAN_STOCK` | server (new) | 409 | no | sheet | `ALT`, `OFFICE` | EC-WO-20 |
| `WO_REASSIGNED` | server | 409 | no | conflict banner | `FALLBACK`, `OFFICE` | EC-WO-04 |
| `WO_REOPENED_BY_OFFICE` | client | — | no | notification + job detail | `FALLBACK`, `OFFICE` | EC-WO-18 |
| `WO_SAFETY_STOP_REQUIRED` | server (new) | 409 | no | sheet | `ALT`, `OFFICE` | EC-WO-09 |
| `WO_SIGNATURE_EXCEPTION` | client | — | no | sheet | `RETRY`, `FIX`, `ALT`, `HANDOFF`, `OFFICE` | EC-WO-12 |
| `WO_WAITING_PARTS_HOLD` | client | — | no | sheet | `ALT`, `OFFICE` | EC-WO-13 |

## 13. Coverage by task

Summary: 198 EC entries cover 188 codes (target split: 78 server / 110 client).

| Task | EC entries | Server side | Tests |
|---|---|---|---|
| T03 | EC-PLT-01–43, EC-SYN-01–35 | T02 `ACCOUNT_DISABLED`; T02 `ACCOUNT_IN_OTHER_ORG`; T02 `ACCOUNT_NOT_INVITED`; T02 `APP_UPDATE_REQUIRED`; T02 `INTERNAL`; T02 `INVALID_CREDENTIALS`; T02 `INVITE_EMAIL_MISMATCH`; T02 `INVITE_EXPIRED`; T02 `LOCATION_CONSENT_REQUIRED`; T02 `MEDIA_PART_MISSING`; T02 `MEDIA_TOO_LARGE`; T02 `MEDIA_TYPE_MISMATCH`; T02 `OAUTH_PROVIDER_ERROR`; T02 `OAUTH_STATE_EXPIRED`; T02 `PASSWORD_CHANGE_REQUIRED`; T02 `RATE_LIMITED`; T02 `UNAUTHENTICATED`; T02 `MEDIA_LOCKED`; T02 `MEDIA_NOT_IN_STORAGE`; T02 `UNKNOWN_MUTATION`; T02 `RESET_LINK_EXPIRED`; T02 `RESET_REQUIRED`; T02 `STORAGE_FULL`; T02 `TOKEN_EXPIRED`; T02 `UPLOAD_URL_EXPIRED`; T02 `VALIDATION_FAILED`; T20/T02 `ORG_SUSPENDED` | Mobile recovery-kit, permission, auth, invite, account deletion, org-status banner, storage, sync-engine and crash-resume tests. |
| T04 | EC-PLT-35–36, EC-OPS-01–10, EC-OPS-12–16, EC-OPS-24–28, EC-ERP-01, EC-ERP-03–06 | T02/T04 `INVITE_EMAIL_MISMATCH`; T02/T04 `INVITE_EXPIRED`; T02/T04 `LAST_ADMIN`; T02 `RATE_LIMITED`; T02 `TOKEN_EXPIRED`; T02 `VALIDATION_FAILED`; T04 `CONFLICT`; T04 `FORBIDDEN`; T04 `NOT_FOUND`; T04 `OFFICE_ROLE_REQUIRED`; T04 `PLOT_GEOMETRY_INVALID`; T04 `RECORD_IN_USE`; T04 `SEASON_OVERLAP`; T04 `TEMPLATE_VERSION_IN_USE`; T04/T02 `DIAGNOSTICS_UNAVAILABLE`; T04/T09 `CSV_ENCODING_UNSUPPORTED`; T04/T09 `CSV_FORMAT_UNSUPPORTED`; T04/T09 `IMPORT_ROW_ERRORS` | Web recovery-kit, invite/reset pages, FIELD-on-web gate, last-admin guard, management forms, settings, import, ERP and route tests. |
| T06 | EC-FR-01–15, EC-FR-17–18 | T06/T07 `ASSET_REPAIR_ALREADY_OPEN`; T06 `REPORT_LOCKED` | Field report wizard, report service and mark-for-repair route tests. |
| T07 | EC-WO-01–19, EC-OPS-22 | T04/T07/T08 `METER_READING_JUMP`; T04/T07/T08 `METER_READING_LOWER`; T07 `ASSIGNEE_UNAVAILABLE`; T07 `GUARD_AFTER_PHOTO_REQUIRED`; T07 `GUARD_CHECKLIST_INCOMPLETE`; T07 `WO_ALREADY_VERIFIED`; T07 `WO_ASSET_RETIRED`; T07 `WO_ASSIGNEE_OFF_DUTY`; T07 `WO_CANCELLED`; T07 `WO_DESTINATION_MISSING`; T07 `WO_REASSIGNED`; T07 `WO_SAFETY_STOP_REQUIRED` | Work-order mobile/web/API, checklist, navigation, signature and assignment tests. |
| T08 | EC-RN-01–38 | T04/T07/T08 `METER_READING_JUMP`; T04/T07/T08 `METER_READING_LOWER`; T08 `ASSET_DOUBLE_BOOKED`; T08 `ASSET_NOT_RENTABLE`; T08 `ASSET_NOT_OPERATIONAL`; T08 `ASSET_HAS_CRITICAL_REPORT`; T08 `CUSTOMER_INCOMPLETE`; T08 `GUARD_CHECKIN_INCOMPLETE`; T08 `GUARD_CHECKOUT_INCOMPLETE`; T08 `GUARD_SIGNATURE_REQUIRED`; T08 `RENTAL_ASSET_MISMATCH`; T08 `RENTAL_CHARGES_UPDATED`; T08 `RENTAL_DAMAGE_REPORT_FAILED`; T08 `RENTAL_DATES_INVALID`; T08 `RENTAL_NOT_ACTIVE`; T08 `RENTAL_NOT_FOUND`; T08 `RENTAL_NOT_RESERVED`; T08 `RENTAL_SITE_MISMATCH` | Rental reservation, checkout/check-in wizard, charge, inspection and conflict tests. |
| T09 | EC-OPS-11, EC-OPS-17–21, EC-OPS-23, EC-OPS-30, EC-ERP-02 | T09 `ALREADY_RESOLVED`; T09 `GUARD_RESOLUTION_REQUIRED`; T09 `COST_SEASON_MISSING`; T09/T05 `EXPORT_JOB_STARTED` | Ops Center, realtime, attention queue, export job and alert tests. |
| T14 | EC-WO-20 | T14 `WO_PART_NOT_IN_VAN_STOCK` | P1 parts and van-stock tests. |
| T15 | EC-RN-32–34 | T08 `ASSET_DOUBLE_BOOKED`; T15 `INBOUND_RENTAL_INCOMPLETE`; T15 `RENTAL_BILLING_DOCUMENT_FAILED` | P1 rental extension, billing document and partner-rental tests. |
| T19 | EC-SITE-01–07 | — | Static site Playwright, link checker, Lighthouse and localized help-page tests. |
| T20 | EC-PLT-40, EC-OPS-29 | T20 `ORG_SUSPENDED`; T05 `org:status`; T02 sync/auth org-status gate | Sign-up transaction, ticket expiry, rate limits, lifecycle transitions with fake clock, 7-day push grace, purge isolation, platform route isolation and staff audit tests. |
| T10 | all code-indexed EC entries | verifies every server/client code maps to `ERROR_META` and i18n | code index ↔ `ERROR_META` ↔ `errors.<CODE>.title\|body\|action\|help` check; fails on unused or missing codes |
| T11 | EC-PLT-35–36, EC-OPS-02, EC-OPS-05, EC-OPS-07–10, EC-OPS-14–17, EC-OPS-27–29 | web route/API owners from listed entries | Playwright journeys: sign-up via mock Google, invite redemption with other email attention, FIELD on web, last-admin guard, platform status change, reauth with unsaved form, conflict merge, bulk partial failure, import errors, offline browser and realtime loss. |
| T12 | EC-PLT-40, EC-PLT-42, EC-SYN-01–35 | T02 sync/media/org-status routes; T05 worker stale-device/media jobs; T20 lifecycle jobs | Offline chaos suite covers every EC-SYN entry plus role change while offline, org suspended with pending outbox through grace/hold/reactivation, and account deletion with pending items. |
| T17 | EC-PLT-10, EC-PLT-11, EC-PLT-14, EC-PLT-17, EC-PLT-24, EC-PLT-30, EC-PLT-34, EC-PLT-40, EC-PLT-42, EC-FR-05, EC-FR-12, EC-FR-16, EC-WO-12, EC-WO-21, EC-RN-16 | uses task-owned APIs through mobile flows | Maestro error flows for P0 field recovery: permissions, storage, clock, QR, PDF share, account-not-in-team, company paused, account deletion pending, evidence required, draft recovery, signature exception and rental draft resume. |

## 14. Top cases

| # | EC ID | Case | Why it matters |
|---:|---|---|---|
| 1 | EC-SYN-05 | Wi-Fi captive portal | Common on farms, hotels and yards; prevents confusing failed sends and protects credentials. |
| 2 | EC-SYN-06 | Very slow connection | Low-bandwidth rural links are frequent; essentials must send before videos. |
| 3 | EC-PLT-06 | Re-login without data loss | Tokens expire in normal use; pending field work must stay safe and resume after the same user signs in. |
| 4 | EC-PLT-14 | Device storage full | Photos and videos are core evidence; storage pressure is common on shared phones. |
| 5 | EC-SYN-13 | Local DB repair | Protects the offline-first promise when updates or storage corruption happen. |
| 6 | EC-SYN-02 | Stuck field action | A blocked outbox item can hold later work; REC-09 attention plus diagnostics keeps data moving. |
| 7 | EC-SYN-27 | Attachment stuck over a day | Media delays are frequent and support-heavy; both user and office get a path. |
| 8 | EC-WO-03 | Job cancelled while offline | Offline field workers may keep working; evidence must be preserved and explained. |
| 9 | EC-WO-09 | Safety stop-work | High impact: unsafe work must stop immediately and notify the office. |
| 10 | EC-WO-12 | Customer signature exception | Rural customers are often absent; completion must stay honest and auditable. |
| 11 | EC-RN-13 | Rental signer unavailable | Hand-overs and returns depend on signatures; no fake signature or lost inspection. |
| 12 | EC-RN-23 | Damage unclear in field | Mud, dark photos and disputes are common; charges must wait for review. |
| 13 | EC-OPS-02 | Web re-auth while editing | Office users must not lose long forms when sessions expire. |
| 14 | EC-PLT-03 | Disabled access with pending work | Prevents data loss and panic when employment or role changes happen mid-fieldwork; drain lasts 72 h for allowed evidence only. |
| 15 | EC-PLT-25 | QR unreadable | Dirty or damaged tags are frequent; manual lookup keeps work moving. |
