# AgroRende support guide

This guide is for the people who answer customers: AgroRende's own support desk and the office staff
(administrators and managers) of each customer company, who are the first line for their field
crews. It explains what to do for every error case the product knows about, how to work the
**Needs attention** queue, how to read diagnostics from a phone, and how to help with team access,
account deletion and the organization's subscription status.

The error catalogue itself, with the exact wording on every screen, is
[`docs/ERRORS.md`](ERRORS.md). Infrastructure work (restores, secrets, logs on the server) is in
[`docs/RUNBOOK.md`](RUNBOOK.md).

## 1. Principles

- **Field work is never lost.** Anything a person captured on their phone stays there until the
  server has confirmed it, even after a sign-out, a deactivation, a full storage or an app update.
  Never tell anyone to uninstall the app, clear its data or "reinstall to fix it"; that is the one
  thing that can destroy unsent work.
- **Every error has a way out.** Each message on screen offers at least one action (the recovery
  patterns below). Support's job is usually to help the person take that action, or to do the
  office side of it.
- **Use the reference.** Server errors show a short reference (`ref`) under *Details*. Ask for it;
  it finds the exact request in the logs without anyone reading out personal data.
- **No personal data in tickets.** Write user ids, work order numbers (`WO-…`), report numbers
  (`FR-…`), rental numbers (`RN-…`) and machine codes (`AGR-…`). Do not copy passwords, full
  documents, exact coordinates or photo contents into tickets or chats.
- **Customer data belongs to the customer.** AgroRende staff see organizations, usage and
  administrators through the platform console only. They never sign in as a customer user.

## 2. Recovery patterns

These are the "ways out" listed for each case in the table in §3.

| Code | What the person can do | What support usually does |
|---|---|---|
| `AUTO` | Nothing: the app retries by itself with backoff and shows the status. | Reassure, and check the device on `/team/devices` if it lasts more than a day. |
| `RETRY` | Tap **Try again**. Requests are safe to repeat. | Confirm the connection, then ask them to retry. |
| `FIX` | Correct the highlighted field; their input is kept. | Explain what a valid value looks like. |
| `ALT` | Take another path to the same goal (type the code instead of scanning, pick from the gallery, pick the site by hand). | Point at the alternative action on the same screen. |
| `DRAFT` | Save and continue later from the same step. | Tell them where the draft is (*Continue draft*). |
| `UNDO` | Undo a deletion within 10 seconds, or restore a deleted draft from *Recently deleted*. | Guide them to *Recently deleted*. |
| `RESTORE` | Restore an archived office record. | An administrator restores it from the record's page. |
| `SETTINGS` | Open the phone or browser setting (permission, battery, storage, clock), then **Check again**. | Walk them through the setting for their phone brand. |
| `REAUTH` | Sign in again in a dialog over the current screen; nothing on screen is lost. | Make sure they use the same account as before. |
| `UPDATE` | Update the app from the store; local data is kept. | Send the store link. |
| `OFFICE` | Call or send WhatsApp to the office from the error sheet, with the context filled in. | Answer with the context shown; decide or escalate. |
| `DIAG` | **Send diagnostics** from Settings → Help or from the error sheet. Works offline: it is sent with the next sync. | Read the report on `/team/devices` (see §5). |
| `HANDOFF` | Nothing more: the case was sent to the office's **Needs attention** queue and they keep working. | Resolve the item in `/attention` (see §4). |
| `FALLBACK` | Keep working with the last known data; the screen says when the feature returns. | Explain the limitation and the expected return. |

## 3. Support actions for every error case

One row per error case in `docs/ERRORS.md`, in the same order. *Code* is the error code the app
or API reports (you will see it in diagnostics and logs). *User's way out* uses the patterns in
§2. *What the office sees* is what an administrator or manager can check in the web app.
*What support does* is the support action.

When a case is not in this table, the error code is still listed in `docs/ERRORS.md` §12 (code
index); find the case there.

### Platform and device (EC-PLT)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-PLT-01 | First sign-in needs internet | `FIRST_LOGIN_ONLINE_REQUIRED` | `SETTINGS`, `OFFICE` | Nothing. | Walk the user through the phone or browser setting, then Check again. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-02 | Email or password not accepted | `INVALID_CREDENTIALS` | `FIX`, `OFFICE` | Rate-limit and auth logs with the request ref, never whether the e-mail exists or the password value. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-03 | Account disabled | `ACCOUNT_DISABLED` | `FALLBACK`, `DIAG`, `OFFICE` | User disabled state, device pending count, drain-token window and evidence-only sends. | Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-04 | Password change needed | `PASSWORD_CHANGE_REQUIRED` | `FIX`, `DRAFT`, `OFFICE` | Password-change-required state on the user profile. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-05 | Password reset link expired | `RESET_LINK_EXPIRED` | `RETRY`, `OFFICE` | Password reset request timestamp and user status. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-06 | Sign in again to send | `TOKEN_EXPIRED` | `REAUTH`, `FALLBACK`, `DRAFT`, `OFFICE` | Device last sync and pending counts may become stale; OFF-11 alerts cover devices unsynced over 24 h. | Ask the user to sign in again on the dialog; nothing on screen is lost. Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-07 | Session was protected | `REFRESH_REUSED` | `REAUTH`, `DRAFT`, `OFFICE` | Security log with user, device and token family; device pending counts remain visible. | Ask the user to sign in again on the dialog; nothing on screen is lost. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-08 | Access changed while working | `RESET_REQUIRED` | `FALLBACK`, `HANDOFF`, `OFFICE`, `AUTO`, `RETRY` | Unresolved rejected actions in Needs attention, plus the role-change audit event. | Explain that the feature is degraded and when it returns; last known data stays visible. Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-09 | Pending items on sign out | `LOGOUT_PENDING_DATA` | `DRAFT`, `FALLBACK`, `OFFICE` | Device pending counts and oldest pending age. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-10 | Camera or microphone blocked | `PERMISSION_MEDIA_BLOCKED` | `SETTINGS`, `ALT`, `OFFICE` | Nothing unless the user sends diagnostics. | Walk the user through the phone or browser setting, then Check again. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-11 | Location is limited | `PERMISSION_LOCATION_LIMITED` | `SETTINGS`, `ALT`, `FALLBACK` | Device health shows location unavailable/approximate while on duty. | Walk the user through the phone or browser setting, then Check again. Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-PLT-12 | Location consent not given | `LOCATION_CONSENT_REQUIRED` | `FIX`, `FALLBACK`, `OFFICE` | User remains Off duty; consent timestamp remains empty or revoked. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-13 | Notifications are off | `PERMISSION_NOTIFICATIONS_OFF` | `SETTINGS`, `FALLBACK`, `OFFICE` | Device notification token status and failed-delivery count on Team → Devices. | Walk the user through the phone or browser setting, then Check again. Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-14 | Device storage is full | `DEVICE_STORAGE_FULL` | `SETTINGS`, `RETRY`, `DRAFT`, `ALT`, `OFFICE` | Device free-storage value and pending bytes on Team → Devices after the next successful contact. | Walk the user through the phone or browser setting, then Check again. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-15 | Background work is blocked | `BATTERY_BACKGROUND_RESTRICTED` | `SETTINGS`, `FALLBACK`, `DIAG` | Device may become stale; diagnostics include manufacturer and battery optimization state. | Walk the user through the phone or browser setting, then Check again. Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. |
| EC-PLT-16 | Network is restricted | `NETWORK_RESTRICTED` | `SETTINGS`, `RETRY`, `FALLBACK` | Last sync time ages; stale device alert may fire after 24 h. | Walk the user through the phone or browser setting, then Check again. Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-PLT-17 | Phone clock looks wrong | `DEVICE_CLOCK_SKEWED` | `SETTINGS`, `FALLBACK` | Activity metadata shows the corrected time and device skew so events can be ordered without blaming the user. | Walk the user through the phone or browser setting, then Check again. Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-PLT-18 | Phone memory interrupted capture | `DEVICE_MEMORY_LOW` | `DRAFT`, `RETRY`, `ALT`, `DIAG` | Nothing unless diagnostics are sent. | Read the uploaded diagnostics for the device before answering. |
| EC-PLT-19 | App update required | `APP_UPDATE_REQUIRED` | `UPDATE`, `DRAFT`, `OFFICE` | Device appVersion/runtimeVersion behind required version on Team → Devices. | Ask the user to update the app from the store; local data is kept. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-20 | Update could not install | `OTA_UPDATE_FAILED` | `RETRY`, `FALLBACK`, `UPDATE`, `DIAG` | Diagnostics include update channel, runtime and failure reason. | Explain that the feature is degraded and when it returns; last known data stays visible. Ask the user to update the app from the store; local data is kept. Read the uploaded diagnostics for the device before answering. |
| EC-PLT-21 | Screen reloaded safely | `SCREEN_CRASHED` | `RETRY`, `FALLBACK`, `DRAFT`, `DIAG` | Diagnostics/Sentry event without form contents or PII. | Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. |
| EC-PLT-22 | Language falls back safely | `LOCALE_FALLBACK_USED` | `FALLBACK`, `SETTINGS` | Nothing. | Explain that the feature is degraded and when it returns; last known data stays visible. Walk the user through the phone or browser setting, then Check again. |
| EC-PLT-23 | Number format not clear | `INVALID_LOCALE_NUMBER` | `FIX` | Nothing. | Help the user correct the highlighted field; their input is kept. |
| EC-PLT-24 | QR code could not be read | `SCAN_UNREADABLE` | `ALT`, `RETRY`, `OFFICE` | Nothing unless diagnostics are sent. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-25 | QR belongs to another company | `ASSET_QR_OTHER_ORG` | `ALT`, `OFFICE` | Optional diagnostic with scanned prefix only, not the foreign asset data. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-26 | Asset not available on device | `ASSET_LOOKUP_UNAVAILABLE` | `ALT`, `FALLBACK`, `OFFICE` | If submitted as unregistered, the item appears for office triage/linking. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-27 | Serial number not read | `SERIAL_OCR_FAILED` | `ALT`, `RETRY`, `OFFICE` | Nothing unless the photo is later submitted as evidence. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-28 | Offline search found nothing | `OFFLINE_SEARCH_NO_RESULTS` | `FIX`, `ALT`, `FALLBACK` | Nothing. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-PLT-29 | Near me needs location | `GPS_UNAVAILABLE` | `ALT`, `SETTINGS`, `RETRY` | Device health may show location unavailable while on duty. | Walk the user through the phone or browser setting, then Check again. |
| EC-PLT-30 | PDF cannot be shared now | `PDF_SHARE_UNAVAILABLE` | `FALLBACK`, `ALT`, `OFFICE` | Nothing unless the completion/check-in is stuck or the user asks the office to send the PDF. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-31 | Diagnostics not sent yet | `DIAGNOSTICS_SEND_FAILED` | `AUTO`, `RETRY`, `OFFICE` | Queued diagnostics appear on the device page once sent. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-32 | Office contact missing | `OFFICE_CONTACT_MISSING` | `DIAG`, `FALLBACK`, `HANDOFF` | Settings gap on Organization settings; diagnostics/Needs attention item includes missing contact flag. | Read the uploaded diagnostics for the device before answering. Explain that the feature is degraded and when it returns; last known data stays visible. Resolve the item in Needs attention; the user keeps working meanwhile. |
| EC-PLT-33 | Another user has pending data | `SHARED_DEVICE_PENDING_DATA` | `REAUTH`, `FALLBACK`, `OFFICE` | Device page shows pending counts per last signed-in user, without exposing record contents. | Ask the user to sign in again on the dialog; nothing on screen is lost. Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-34 | Account not in a team yet | `ACCOUNT_NOT_INVITED` | `FIX`, `OFFICE` | Nothing unless the person shares the shown email; sign-in logs include the request ref without creating a user. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-35 | Invite no longer valid | `INVITE_EXPIRED` | `OFFICE`, `FIX` | Invite state and resend action on Team; failed lookup logs are rate-limited by IP. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-36 | Office invite needs the invited email | `INVITE_EMAIL_MISMATCH` | `FIX`, `OFFICE` | The invite remains pending; Team shows resend/revoke and the failed attempt ref. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-37 | Account already belongs to another company | `ACCOUNT_IN_OTHER_ORG` | `FIX`, `OFFICE` | The target invite remains pending; support can use the request ref, but no tenant data is exposed across companies. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-38 | Sign-in took too long | `OAUTH_STATE_EXPIRED` | `RETRY` | Auth log with expired state reason and request ref, no provider token contents. | Ask the user to tap Try again; the request is safe to repeat. |
| EC-PLT-39 | Google or Apple did not answer | `OAUTH_PROVIDER_ERROR` | `RETRY`, `FALLBACK` | Grouped auth-provider error metrics and request refs, without provider tokens. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-PLT-40 | Company access paused (field) | `ORG_SUSPENDED` | `FALLBACK`, `OFFICE`, `AUTO` | Subscription page and platform console status, suspendedAt/cancelledAt, grace window and device pending counts. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-PLT-41 | Sign-in cancelled | `OAUTH_CANCELLED` | `RETRY` | Nothing; this quiet client-only state does not create support noise. | Ask the user to tap Try again; the request is safe to repeat. |
| EC-PLT-42 | Delete account with items waiting | `ACCOUNT_DELETE_PENDING_DATA` | `RETRY`, `FIX` | Synced work if the user sends first; otherwise no deletion proceeds from this device until pending data is cleared or copied. After deletion, the `auth.appleRevoke` job revokes the Apple token with retries; when all 5 attempts fail, the job stays in the BullMQ failed set with the internal reason `APPLE_REVOKE_FAILED` and the Apple identity is not deleted. Support retries the job (recovery `OFFICE`); this reason is not a catalogued code and the user sees no message. | Ask the user to tap Try again; the request is safe to repeat. |
| EC-PLT-43 | Sign in required | `UNAUTHENTICATED` | `REAUTH`, `DRAFT`, `OFFICE` | Auth log with request ref only when a protected API route was attempted. | Ask the user to sign in again on the dialog; nothing on screen is lost. Answer the call or WhatsApp message using the reference and context shown. |

### Sync and media (EC-SYN)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-SYN-01 | Too many items waiting | `OUTBOX_BACKLOG` | `AUTO`, `RETRY`, `DIAG`, `OFFICE` | Device health shows pending counts and bytes; alert if older than 24 h. | Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-02 | One item is stuck | `OUTBOX_ITEM_STUCK` | `RETRY`, `DIAG`, `OFFICE` | Needs attention item if it remains stuck over 24 h or diagnostics are sent. | Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-03 | Only part of the batch was sent | `PUSH_PARTIAL_RETRY` | `AUTO`, `RETRY` | Applied items appear normally; pending counts remain on device health. | Nothing to do while it retries; if it stays stuck, open the device in Settings → Devices and check its last sync. |
| EC-SYN-04 | Service is unstable | `INTERNAL` | `AUTO`, `RETRY`, `FALLBACK`, `DIAG` | Device last sync and pending counts grow; outage telemetry groups by `INTERNAL` refs. | Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. |
| EC-SYN-05 | Wi‑Fi needs a login | `CAPTIVE_PORTAL` | `ALT`, `AUTO`, `FALLBACK` | Device appears unsynced until the user connects; no false server error ref. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-06 | Connection is very slow | `SLOW_CONNECTION` | `AUTO`, `ALT`, `FALLBACK` | Partial evidence may arrive first; pending bytes remain visible on the device page. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-07 | Sending is being paced | `RATE_LIMITED` | `AUTO`, `RETRY`, `OFFICE` | Rate-limit events in logs; device health still shows pending counts. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-08 | Data refresh required | `RESET_REQUIRED` | `AUTO`, `RETRY`, `FALLBACK`, `OFFICE`, `HANDOFF` | Device reset reason, scope epoch, last pull version and any unresolved rejected actions if a role change caused the reset. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. Resolve the item in Needs attention; the user keeps working meanwhile. |
| EC-SYN-09 | Item needs review before sending | `VALIDATION_FAILED` | `UPDATE`, `FIX`, `RETRY`, `OFFICE` | Unresolved rejected mutation in Needs attention with code, context and ref. | Ask the user to update the app from the store; local data is kept. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-10 | New data did not arrive yet | `PULL_FAILED` | `AUTO`, `RETRY`, `FALLBACK` | Pushed changes are visible; device last pull remains stale. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-11 | First download is large | `FIRST_SYNC_LARGE` | `AUTO`, `RETRY`, `FALLBACK` | Device initial sync progress via last pull/version once pushes happen. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-12 | Local update did not finish | `LOCAL_MIGRATION_FAILED` | `RETRY`, `UPDATE`, `DIAG`, `OFFICE` | Diagnostics if sent; device remains stale otherwise. | Ask the user to update the app from the store; local data is kept. Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-13 | Repair local data | `LOCAL_DB_REPAIR_REQUIRED` | `RETRY`, `DIAG`, `HANDOFF`, `OFFICE` | Diagnostics with integrity-check summary and a Needs attention item if pending work was exported or cannot be recovered. | Read the uploaded diagnostics for the device before answering. Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-14 | Camera did not save | `MEDIA_CAPTURE_FAILED` | `RETRY`, `ALT`, `DRAFT` | Nothing unless the user sends diagnostics. | Ask the user to tap Try again; the request is safe to repeat. |
| EC-SYN-15 | Not enough room to record | `MEDIA_DEVICE_STORAGE_LOW` | `SETTINGS`, `ALT`, `DRAFT` | Device health free storage warning on next push. | Walk the user through the phone or browser setting, then Check again. |
| EC-SYN-16 | Video is too long | `VIDEO_TOO_LONG` | `FIX`, `ALT`, `DRAFT` | Nothing. | Help the user correct the highlighted field; their input is kept. |
| EC-SYN-17 | File left the device | `LOCAL_MEDIA_MISSING` | `ALT`, `FIX`, `OFFICE` | Media pending/stuck if the parent already reached the office; Needs attention after 24 h. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-18 | File cannot be opened | `LOCAL_MEDIA_CORRUPT` | `ALT`, `FIX`, `DRAFT` | Pending media missing original; Needs attention after 24 h if parent is already visible. | Point the user to the alternative path offered on the same screen. |
| EC-SYN-19 | File sending was interrupted | `UPLOAD_INTERRUPTED` | `AUTO`, `RETRY`, `FALLBACK` | Media stays PENDING until complete; pending bytes on device page. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-20 | Upload link expired | `UPLOAD_URL_EXPIRED` | `AUTO`, `RETRY` | Nothing unless it remains pending over 24 h. | Nothing to do while it retries; if it stays stuck, open the device in Settings → Devices and check its last sync. |
| EC-SYN-21 | File is too large to send | `MEDIA_TOO_LARGE` | `FIX`, `ALT`, `OFFICE` | Pending/failed attachment on Needs attention if parent is already visible. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-22 | Storage for files is full | `STORAGE_FULL` | `AUTO`, `RETRY`, `OFFICE` | Operations alert/health check for media storage; media remains PENDING. `GET /health` reports `media: false` when `MEDIA_ROOT` is not writable but keeps HTTP 200 while the database is up, so operators check the disk (T13 runbook). | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-23 | File format does not match | `MEDIA_TYPE_MISMATCH` | `ALT`, `FIX`, `OFFICE` | Failed media item with ref if parent exists; Needs attention after 24 h. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-24 | A piece of the file is missing | `MEDIA_PART_MISSING` | `AUTO`, `RETRY` | Media remains PENDING; no duplicate attachment. | Nothing to do while it retries; if it stays stuck, open the device in Settings → Devices and check its last sync. |
| EC-SYN-25 | Video is waiting for Wi‑Fi | `WIFI_ONLY_MEDIA_WAITING` | `ALT`, `RETRY`, `OFFICE` | Pending bytes and PENDING media; Needs attention after 24 h. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-26 | Preview did not appear | `THUMBNAIL_FAILED` | `AUTO`, `RETRY`, `FALLBACK` | Generic placeholder until thumbnail arrives; original is available when complete. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-27 | Attachment pending too long | `MEDIA_PENDING_STALE` | `RETRY`, `DIAG`, `HANDOFF`, `OFFICE` | Needs attention queue item with parent, user, device, pending age, bytes and last error. | Read the uploaded diagnostics for the device before answering. Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-28 | Too many saved locations | `LOCATION_BUFFER_TRIMMED` | `AUTO`, `HANDOFF`, `FALLBACK` | Trail gap marker and device alert; no false live position. | Resolve the item in Needs attention; the user keeps working meanwhile. Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-29 | Nothing sent for a day | `DEVICE_UNSYNCED_STALE` | `RETRY`, `DIAG`, `OFFICE` | Ops alert and Team → Devices row with last sync, pending counts, app version and battery. | Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-30 | Sending continues after restart | `UPLOAD_RESUME_AFTER_RESTART` | `AUTO`, `RETRY` | No duplicate records; media remains PENDING until complete. | Nothing to do while it retries; if it stays stuck, open the device in Settings → Devices and check its last sync. |
| EC-SYN-31 | Data is on another device | `SAME_USER_MULTIPLE_DEVICES` | `ALT`, `OFFICE`, `FALLBACK` | Team → Devices lists each device separately with pending counts and last sync. | Answer the call or WhatsApp message using the reference and context shown. Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-32 | Media is locked by another action | `MEDIA_LOCKED` | `FALLBACK`, `OFFICE` | Blocked media mutation ref with parent item and actor. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-33 | Original media still sending | `MEDIA_NOT_IN_STORAGE` | `FALLBACK`, `DIAG`, `OFFICE` | Media variant status and pending bytes on the device/media detail. | Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-SYN-34 | Step no longer valid | `INVALID_TRANSITION` | `FALLBACK`, `RETRY` | Needs attention conflict with attempted transition, current state and request ref when it cannot auto-resolve. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SYN-35 | App action not recognized | `UNKNOWN_MUTATION` | `UPDATE`, `DIAG`, `OFFICE` | Needs attention item with mutation name, app version, device and ref. | Ask the user to update the app from the store; local data is kept. Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |

### Field reports (EC-FR)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-FR-01 | Machine not found | `REPORT_MACHINE_NOT_FOUND` | `ALT`, `OFFICE` | Nothing until submit; if submitted as unregistered, the triage inbox shows the plate photo and free text. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-02 | Plate photo missing | `REPORT_UNREGISTERED_MACHINE_INCOMPLETE` | `FIX`, `DRAFT` | Nothing until submit. | Help the user correct the highlighted field; their input is kept. |
| EC-FR-03 | Different machine scanned | `REPORT_MACHINE_CHANGED` | `ALT`, `DRAFT` | Nothing until submit. | Point the user to the alternative path offered on the same screen. |
| EC-FR-04 | Machine needs office attention | `REPORT_ASSET_ATTENTION` | `ALT`, `HANDOFF`, `OFFICE` | Triage badge for retired, rented out, already in repair or unregistered machine, plus link to the rental/open WO when one exists. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-05 | Add at least one photo or video | `REPORT_EVIDENCE_REQUIRED` | `FIX`, `DRAFT` | Nothing until submit. | Help the user correct the highlighted field; their input is kept. |
| EC-FR-06 | Too many videos | `REPORT_VIDEO_LIMIT_EXCEEDED` | `FIX`, `ALT`, `UNDO` | Nothing until submit. | Help the user correct the highlighted field; their input is kept. |
| EC-FR-07 | Voice note not recorded | `VOICE_NOTE_FAILED` | `RETRY`, `ALT`, `SETTINGS` | Nothing. | Walk the user through the phone or browser setting, then Check again. |
| EC-FR-08 | Gallery item missing date or place | `REPORT_MEDIA_METADATA_MISSING` | `ALT`, `FIX` | Submitted media is flagged `metadataFromDevice=true` in the report gallery. | Point the user to the alternative path offered on the same screen. |
| EC-FR-09 | Details still incomplete | `REPORT_DETAILS_INCOMPLETE` | `FIX`, `DRAFT` | Nothing unless an old app sends invalid data; then Needs attention shows `VALIDATION_FAILED`. | Help the user correct the highlighted field; their input is kept. |
| EC-FR-10 | Location is weak or unavailable | `REPORT_LOCATION_WEAK` | `ALT`, `SETTINGS`, `OFFICE` | Report map badge `approximate location` with accuracy meters and whether the site was user-selected. | Walk the user through the phone or browser setting, then Check again. Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-11 | No plots for this farm | `REPORT_NO_PLOTS_AVAILABLE` | `FALLBACK`, `FIX` | Report has site only; triage can add a plot later when one exists. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-FR-12 | Draft recovered after interruption | `REPORT_DRAFT_RESTORED` | `DRAFT`, `ALT`, `UNDO` | Nothing until submit. | Reassure the user that the draft is saved and resumes at the same step. |
| EC-FR-13 | Critical issue on a busy asset | `REPORT_ASSET_BUSY` | `HANDOFF`, `OFFICE` | Urgent report linked to the active rental or open WO, with an alert to decide whether to attach, create a new WO or contact the customer. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-14 | Report marked for repair | `REPORT_MARKED_FOR_REPAIR_STATUS` | `FALLBACK`, `OFFICE` | Report status `MARKED_FOR_REPAIR`, linked WO and notification delivery state. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-15 | Repair job already open | `ASSET_REPAIR_ALREADY_OPEN` | `ALT`, `FIX`, `HANDOFF` | Dialog with the existing WO number, assignee, status, latest activity and ADMIN/MANAGER Create anyway action. | Resolve the item in Needs attention; the user keeps working meanwhile. |
| EC-FR-16 | Similar open report found | `REPORT_DUPLICATE_HINT` | `ALT`, `DRAFT` | If the user continues, triage shows a duplicate hint and link to the open item. | Point the user to the alternative path offered on the same screen. |
| EC-FR-17 | Report merged as duplicate | `REPORT_DUPLICATE_MERGED` | `FALLBACK`, `OFFICE` | Audit trail with source report, target item and merge reason. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-FR-18 | Report is locked | `REPORT_LOCKED` | `FALLBACK`, `OFFICE` | Blocked report mutation with actor, current status and request ref. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |

### Repair (EC-WO)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-WO-01 | New job arrived while offline | `WO_ASSIGNED_STALE` | `FALLBACK`, `AUTO` | Assignment remains active; last-sync time explains any delay. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-WO-02 | Decline reason needed | `WO_DECLINE_REASON_REQUIRED` | `FIX`, `DRAFT` | Nothing until the decline is submitted; then timeline shows the reason. | Help the user correct the highlighted field; their input is kept. |
| EC-WO-03 | Job cancelled while offline | `WO_CANCELLED` | `FALLBACK`, `OFFICE` | Cancelled WO with `hasLateEvidence`, Needs attention item and LATE_EVIDENCE notification. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-04 | Job reassigned while offline | `WO_REASSIGNED` | `FALLBACK`, `OFFICE` | Reassignment timeline, previous assignee evidence and LATE_EVIDENCE alert. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-05 | Job changed while offline | `WO_CHANGED_STALE` | `FIX`, `FALLBACK` | Normal activity timeline; no attention item unless a local action later conflicts. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-WO-06 | Navigation app not installed | `NAV_APP_MISSING` | `ALT`, `OFFICE` | Nothing. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-07 | Destination missing | `WO_DESTINATION_MISSING` | `OFFICE`, `ALT` | Needs attention on the WO and dispatch form highlights destination. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-08 | Map opened the wrong place | `NAV_DESTINATION_DOUBTFUL` | `ALT`, `OFFICE` | Attention note with the field worker's correction request and current GPS if available. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-09 | Safety item failed | `WO_SAFETY_STOP_REQUIRED` | `ALT`, `OFFICE` | WO On hold · safety with failed safety item, evidence, notification and manager/admin release control. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-10 | After photo missing | `GUARD_AFTER_PHOTO_REQUIRED` | `FIX`, `DRAFT` | Nothing until valid completion; if server rejects, Sync Center and Needs attention show the missing guard. | Help the user correct the highlighted field; their input is kept. |
| EC-WO-11 | Checklist still incomplete | `GUARD_CHECKLIST_INCOMPLETE` | `FIX`, `DRAFT` | Nothing until valid completion; stale rejection shows the guard code and snapshot. | Help the user correct the highlighted field; their input is kept. |
| EC-WO-12 | Customer signature exception | `WO_SIGNATURE_EXCEPTION` | `RETRY`, `FIX`, `ALT`, `HANDOFF`, `OFFICE` | Needs attention item, completion timeline, PDF marker `Not signed: <reason>` and any witness name/photo. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-13 | Waiting for parts | `WO_WAITING_PARTS_HOLD` | `ALT`, `OFFICE` | ON_HOLD with WAITING_PARTS, note, SLA/work-time calculation excluding hold time. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-14 | Hour meter needs review | `METER_READING_LOWER` | `FIX`, `ALT`, `OFFICE` | Activity note for ignored/lowered reading, confirmed jump or meter-replacement flag for review. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-15 | Office already verified it | `WO_ALREADY_VERIFIED` | `FALLBACK`, `HANDOFF`, `OFFICE` | Verified WO with late evidence and Needs attention item. | Explain that the feature is degraded and when it returns; last known data stays visible. Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-16 | Job is for a retired asset | `WO_ASSET_RETIRED` | `HANDOFF`, `FALLBACK`, `OFFICE` | Needs attention item with retired asset badge and actions to cancel, change asset or reactivate asset separately. | Resolve the item in Needs attention; the user keeps working meanwhile. Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-17 | Same job open for two assignees | `WO_CONCURRENT_TECHNICIAN` | `FALLBACK`, `OFFICE` | Possible duplicate active assignee alert with both names and latest activity. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-18 | Reopened by the office | `WO_REOPENED_BY_OFFICE` | `FALLBACK`, `OFFICE` | Reopened status, reason and notification delivery state. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-19 | Assignee is off duty | `WO_ASSIGNEE_OFF_DUTY` | `FIX`, `ALT` | Same dialog; if assigned anyway, timeline notes off-duty assignment. | Help the user correct the highlighted field; their input is kept. |
| EC-WO-20 | Part not in van stock | `WO_PART_NOT_IN_VAN_STOCK` | `ALT`, `OFFICE` | Hold/transfer request or free-text part line with no stock movement. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-WO-21 | Arrival prompt looks wrong | `WO_ARRIVAL_PROMPT_MISMATCH` | `ALT`, `OFFICE` | Optional point correction and arrival decision in the timeline. | Answer the call or WhatsApp message using the reference and context shown. |

### Rental (EC-RN)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-RN-01 | Rental time already booked | `ASSET_DOUBLE_BOOKED` | `FIX`, `OFFICE` | Nothing unless the user asks the office. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-02 | Machine cannot be rented | `ASSET_NOT_RENTABLE` | `FIX`, `OFFICE` | Nothing unless the user asks the office; the asset page already shows the blocking condition/report. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-03 | Customer details are missing | `CUSTOMER_INCOMPLETE` | `FIX`, `DRAFT`, `OFFICE` | Customer profile marked incomplete if the draft is saved. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-04 | Rental dates are invalid | `RENTAL_DATES_INVALID` | `FIX`, `DRAFT` | Nothing. | Help the user correct the highlighted field; their input is kept. |
| EC-RN-05 | Machine is at another site | `RENTAL_SITE_MISMATCH` | `ALT`, `FIX`, `OFFICE` | Optional Needs attention item if the user asks the office with context. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-06 | QR is for another machine | `RENTAL_ASSET_MISMATCH` | `ALT`, `FIX`, `OFFICE` | Nothing unless the rejected checkout is sent, then the conflict appears in Needs attention. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-07 | Rental cancelled before hand-over | `RENTAL_NOT_RESERVED` | `HANDOFF`, `DRAFT`, `OFFICE` | Rejected mutation in Needs attention with rental snapshot and inspection evidence status. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-08 | Inspection photo needs retake | `RENTAL_PHOTO_UNUSABLE` | `FIX`, `ALT`, `DRAFT` | Nothing until the check-out is confirmed. | Help the user correct the highlighted field; their input is kept. |
| EC-RN-09 | Checkout reading needs review | `METER_READING_LOWER` | `FIX`, `ALT`, `OFFICE` | Timeline note if the checkout is submitted with an explained exception. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-10 | Accessory missing at hand-over | `RENTAL_ACCESSORIES_MISSING` | `FIX`, `DRAFT`, `OFFICE` | Hand-over report lists missing accessories when confirmed. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-11 | Safety orientation missing | `RENTAL_SAFETY_BRIEFING_MISSING` | `FIX`, `DRAFT` | Rejected checkout in Needs attention only if the incomplete action was sent. | Help the user correct the highlighted field; their input is kept. |
| EC-RN-12 | Older terms were signed | `RENTAL_TERMS_OLDER_ACCEPTED` | `HANDOFF`, `FALLBACK`, `OFFICE` | Attention item `Signed older terms vN`, rental `termsVersion`, signer and signed PDF snapshot. | Resolve the item in Needs attention; the user keeps working meanwhile. Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-13 | Signature not completed | `RENTAL_SIGNER_UNAVAILABLE` | `RETRY`, `ALT`, `DRAFT`, `OFFICE` | Signer status, reason, representative data when used, or 48 h dispute window for return damages. A check-in with new damages and an `ABSENT` or `REFUSED` signature writes the `rental.damagesNotAcknowledged` attention activity; the office reviews the damages within the 48 h dispute window. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-14 | Hand-over incomplete when sent | `GUARD_CHECKOUT_INCOMPLETE` | `FIX`, `DRAFT`, `OFFICE` | Unresolved rejected mutation with missing guard details. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-15 | Hand-over document unavailable | `RENTAL_DOCUMENT_UNAVAILABLE` | `RETRY`, `FALLBACK`, `OFFICE` | Document/share failure in the rental timeline if it persists. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-16 | Hand-over interrupted | `RENTAL_DRAFT_INTERRUPTED` | `DRAFT`, `UNDO` | Nothing until the hand-over is confirmed; stale drafts may show only in device diagnostics. | Reassure the user that the draft is saved and resumes at the same step. |
| EC-RN-17 | Rental is overdue | `RENTAL_OVERDUE` | `ALT`, `OFFICE` | Overdue alert and notification from `rentals.overdueScan`. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-18 | Early return | `RENTAL_EARLY_RETURN` | `FIX`, `DRAFT`, `OFFICE` | Timeline note with actual return time after check-in. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-19 | Machine broke during rental | `RENTAL_BREAKDOWN_REPORTED` | `ALT`, `OFFICE`, `DRAFT` | Field report linked to the rental and asset; severe/not-operable reports affect asset condition. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-20 | Machine moved to another place | `RENTAL_LOCATION_CHANGED` | `FIX`, `OFFICE` | Location-change note/Needs attention item with rental and asset context. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-21 | Rental is not active | `RENTAL_NOT_ACTIVE` | `HANDOFF`, `DRAFT`, `OFFICE` | Rejected check-in in Needs attention with rental snapshot. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-22 | Item did not return with machine | `RENTAL_ACCESSORY_RETURN_MISSING` | `FIX`, `DRAFT`, `OFFICE` | Return report and charges review show missing items after submission; rejected incomplete check-ins appear in Needs attention. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-23 | Damage is hard to compare | `RENTAL_DAMAGE_MATCH_UNCLEAR` | `FIX`, `HANDOFF`, `OFFICE` | Damage marked for review on rental detail with both photo sets. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-24 | Customer disputed the damage | `RENTAL_DAMAGE_DISPUTED` | `FIX`, `HANDOFF`, `OFFICE` | Disputed damage badge in Needs attention/rental detail. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-25 | Damage cost is open | `RENTAL_DAMAGE_COST_UNKNOWN` | `FIX`, `HANDOFF` | Needs attention item for damage cost review and rental charges editor. | Resolve the item in Needs attention; the user keeps working meanwhile. |
| EC-RN-26 | Return reading needs review | `METER_READING_LOWER` | `FIX`, `ALT`, `OFFICE` | Meter exception in rental timeline and charges review. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-27 | Fuel reading is not possible | `RENTAL_FUEL_READING_INVALID` | `FIX`, `DRAFT` | Nothing unless submitted with an exception note. | Help the user correct the highlighted field; their input is kept. |
| EC-RN-28 | Totals updated by the office | `RENTAL_CHARGES_UPDATED` | `FIX`, `FALLBACK`, `HANDOFF`, `OFFICE` | Charges review item or activity entry with local estimate versus current charge lines. | Explain that the feature is degraded and when it returns; last known data stays visible. Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-29 | Return incomplete when sent | `GUARD_CHECKIN_INCOMPLETE` | `FIX`, `DRAFT`, `OFFICE` | Unresolved rejected mutation with guard details in Needs attention. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-30 | Another field worker is checking in | `RENTAL_DIFFERENT_AGENT_CHECKIN` | `FIX`, `OFFICE` | Timeline shows both people and the check-in signer. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-31 | Damage report was not created | `RENTAL_DAMAGE_REPORT_FAILED` | `AUTO`, `HANDOFF`, `OFFICE` | Needs attention item for field report creation from rental damage. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-32 | Extension has no availability | `ASSET_DOUBLE_BOOKED` | `FIX`, `OFFICE` | Nothing unless the user asks for help; calendar still shows the conflict. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-33 | Billing document failed | `RENTAL_BILLING_DOCUMENT_FAILED` | `RETRY`, `HANDOFF`, `OFFICE` | Needs attention item for billing completion with rental and charge totals. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-34 | Partner rental incomplete | `INBOUND_RENTAL_INCOMPLETE` | `FIX`, `DRAFT`, `OFFICE` | Incomplete draft on web only if saved online. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-35 | Machine is not operational | `ASSET_NOT_OPERATIONAL` | `FIX`, `OFFICE` | Blocked eligibility ref on the asset/rental draft and current condition. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-36 | Machine has a critical report | `ASSET_HAS_CRITICAL_REPORT` | `FIX`, `OFFICE` | Eligibility block with the critical report link and requester. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-37 | Required signature missing | `GUARD_SIGNATURE_REQUIRED` | `FIX`, `ALT`, `HANDOFF`, `OFFICE` | Rejected guard details with rental, signer role and current draft snapshot. | Resolve the item in Needs attention; the user keeps working meanwhile. Answer the call or WhatsApp message using the reference and context shown. |
| EC-RN-38 | Rental not found | `RENTAL_NOT_FOUND` | `FALLBACK`, `OFFICE` | Request ref with rental id and actor, without exposing cross-tenant data. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |

### Office web (EC-OPS)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-OPS-01 | Login temporarily blocked | `RATE_LIMITED` | `RETRY`, `OFFICE` | Auth log with rate-limit reason and request ref; no password value. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-02 | Session expired while editing | `TOKEN_EXPIRED` | `REAUTH`, `DRAFT`, `OFFICE` | Auth/session log only; no form contents. | Ask the user to sign in again on the dialog; nothing on screen is lost. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-03 | Page not allowed for this role | `FORBIDDEN` | `ALT`, `OFFICE` | Audit/security log with user, route and ref. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-04 | Record no longer available | `NOT_FOUND` | `ALT`, `RESTORE`, `OFFICE` | Nothing unless the user asks for help or restores the record. | Restore the archived record from its restore page if appropriate. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-05 | Someone changed this record | `CONFLICT` | `FIX`, `DRAFT`, `RETRY` | Activity timeline for the accepted change; failed save only in logs with ref. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-06 | Form needs a correction | `VALIDATION_FAILED` | `FIX`, `OFFICE` | Validation ref in logs only. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-07 | Bulk action partly finished | `BULK_PARTIAL_FAILURE` | `RETRY`, `FIX`, `ALT` | Activity events for successful rows and per-row error refs for failed rows. | Ask the user to tap Try again; the request is safe to repeat. |
| EC-OPS-08 | Import file cannot be read | `CSV_ENCODING_UNSUPPORTED` | `FIX`, `RETRY`, `OFFICE` | Import attempt with file size, detected encoding or size limit, context and ref. | Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-09 | Import columns need adjustment | `CSV_FORMAT_UNSUPPORTED` | `FIX`, `RETRY` | Import attempt with parser warnings and ref. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-10 | Import has rows to review | `IMPORT_ROW_ERRORS` | `FIX`, `DRAFT`, `RETRY` | Import preview with row numbers, reasons and who confirmed any partial import. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-11 | Export will be prepared | `EXPORT_JOB_STARTED` | `AUTO`, `FALLBACK` | Export job status, requester, filters, completion/failure notification and download link. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-12 | Archive instead of delete | `RECORD_IN_USE` | `ALT`, `RESTORE`, `OFFICE` | Activity event if the user archives; blocked delete in logs with ref. | Restore the archived record from its restore page if appropriate. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-13 | Template version is in use | `TEMPLATE_VERSION_IN_USE` | `ALT`, `FALLBACK` | Template timeline with version, publisher and affected in-progress count. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-14 | Browser is offline | `BROWSER_OFFLINE` | `FALLBACK`, `RETRY`, `DRAFT` | Nothing unless a later save or diagnostic is sent. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-15 | Browser not supported | `UNSUPPORTED_BROWSER` | `UPDATE`, `ALT`, `OFFICE` | Optional telemetry with browser family/version, no PII. | Ask the user to update the app from the store; local data is kept. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-16 | Upload not accepted | `UPLOAD_FILE_INVALID` | `FIX`, `RETRY` | Upload attempt with reason and ref when the server rejected it. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-17 | Live updates paused | `REALTIME_DISCONNECTED` | `AUTO`, `RETRY`, `FALLBACK` | Realtime connection telemetry and gateway logs. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-18 | Map could not load | `MAP_TILES_UNAVAILABLE` | `RETRY`, `FALLBACK` | Frontend telemetry with tile error and layer name. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-19 | No live operators right now | `OPS_NO_LIVE_OPERATORS` | `FALLBACK`, `RETRY` | The same empty state; no alert unless devices are stale by OFF-11. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-20 | Operator position is old | `OPERATOR_STALE` | `FALLBACK`, `AUTO`, `OFFICE` | Stale state, last update time, battery if known and device sync health link. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-21 | Alerts are grouped | `ALERTS_COLLAPSED` | `FALLBACK`, `FIX` | Grouped count, newest/oldest time and filters to drill into each item. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-22 | Assignee cannot receive this job | `ASSIGNEE_UNAVAILABLE` | `FIX`, `RETRY` | Failed assignment ref and the reason in the dialog; no activity event for a change. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-23 | Attention item already resolved | `ALREADY_RESOLVED` | `FALLBACK`, `RETRY` | Resolver name, time and note on the item history. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-OPS-24 | Diagnostics no longer available | `DIAGNOSTICS_UNAVAILABLE` | `FALLBACK`, `DIAG`, `OFFICE` | Item state as expired/unavailable and device link if the device still exists. | Explain that the feature is degraded and when it returns; last known data stays visible. Read the uploaded diagnostics for the device before answering. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-25 | Office contact is missing | `OFFICE_CONTACT_MISSING` | `FIX` | Settings page warning and recovery-kit health check. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-26 | Organization time zone invalid | `VALIDATION_FAILED` | `FIX`, `RETRY` | Settings audit event only after a successful change. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-27 | Field role on the office web | `OFFICE_ROLE_REQUIRED` | `FALLBACK`, `OFFICE` | Optional auth event for FIELD-on-web attempts; no support item unless the user asks. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-28 | Company needs an administrator | `LAST_ADMIN` | `FIX` | Blocked action ref on Team/Account audit logs; no user state changes until another ADMIN exists. | Help the user correct the highlighted field; their input is kept. |
| EC-OPS-29 | Company access paused (office) | `ORG_SUSPENDED` | `FALLBACK`, `OFFICE` | The same banner plus Settings → Subscription status, export deadline and support contact. | Explain that the feature is degraded and when it returns; last known data stays visible. Answer the call or WhatsApp message using the reference and context shown. |
| EC-OPS-30 | Resolution note required | `GUARD_RESOLUTION_REQUIRED` | `FIX`, `DRAFT` | The same inline guard on the attention detail; failed attempt is logged with ref. | Help the user correct the highlighted field; their input is kept. |

### ERP backbone (EC-ERP)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-ERP-01 | Season dates overlap | `SEASON_OVERLAP` | `FIX`, `RETRY` | Validation ref in logs only. | Help the user correct the highlighted field; their input is kept. |
| EC-ERP-02 | Cost has no season | `COST_SEASON_MISSING` | `FIX`, `ALT` | Needs attention item if the missing season came from an automated completion. | Help the user correct the highlighted field; their input is kept. |
| EC-ERP-03 | Plot shape or area invalid | `PLOT_GEOMETRY_INVALID` | `FIX`, `ALT` | Validation ref only. | Help the user correct the highlighted field; their input is kept. |
| EC-ERP-04 | Site location missing | `SITE_COORDS_MISSING` | `FIX`, `ALT` | Site page warning and any later site update in audit timeline. | Help the user correct the highlighted field; their input is kept. |
| EC-ERP-05 | Money value needs cents | `VALIDATION_FAILED` | `FIX`, `RETRY` | Validation ref only. | Help the user correct the highlighted field; their input is kept. |
| EC-ERP-06 | Season still has open work | `SEASON_OPEN_WORK_WARNING` | `FIX`, `ALT` | Warning list grouped by WO, rental and cost count, plus audit note if closed anyway. | Help the user correct the highlighted field; their input is kept. |

### Public site (EC-SITE)

| EC | Situation | Code | User's way out | What the office sees | What support does |
|---|---|---|---|---|---|
| EC-SITE-01 | Unsupported language link | `SITE_LOCALE_UNSUPPORTED` | `ALT`, `FALLBACK` | Privacy-friendly aggregate 404/redirect count if analytics is enabled. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SITE-02 | Site page not found | `SITE_PAGE_NOT_FOUND` | `ALT`, `FALLBACK` | Aggregate 404 path in site analytics, no cookies. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SITE-03 | WhatsApp did not open | `WHATSAPP_UNAVAILABLE` | `ALT` | Nothing unless the visitor contacts the team. | Point the user to the alternative path offered on the same screen. |
| EC-SITE-04 | Email app did not open | `MAIL_CLIENT_UNAVAILABLE` | `ALT` | Nothing unless the visitor sends an email manually. | Point the user to the alternative path offered on the same screen. |
| EC-SITE-05 | Site works without JavaScript | `JS_DISABLED` | `FALLBACK`, `ALT` | Nothing. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SITE-06 | Slow connection, lighter page | `SITE_SLOW_NETWORK` | `FALLBACK`, `RETRY` | Lighthouse/field performance aggregate if analytics is enabled. | Explain that the feature is degraded and when it returns; last known data stays visible. |
| EC-SITE-07 | Help code unknown | `SITE_ERROR_CODE_UNKNOWN` | `ALT` | Aggregate unknown-code path if analytics is enabled. | Point the user to the alternative path offered on the same screen. |

## 4. Working the Needs attention queue

`/attention` (office web, administrators and managers) collects the field problems that need a
person in the office. The field user is never blocked while an item waits here: their app has
already kept the work and told them the office will handle it. There are four kinds of item:

| Kind | What it means | What to do |
|---|---|---|
| `REJECTED_MUTATION` | A change from a phone could not be applied, for example because the office changed the same job in the meantime, or a reading looked wrong. The item shows what the person tried to do and why it was refused. | Open the linked record, decide what the correct state is, apply it in the web if needed, then **Resolve**. |
| `MEDIA_PENDING` | A photo, video or signature has been waiting to upload for more than 24 hours. | Contact the person: usually the phone has been offline or on a captive-portal Wi-Fi. Ask them to open Sync center on a good connection. If it persists, ask for diagnostics. |
| `STALE_DEVICE` | A phone has had unsent changes for longer than the organization's alert limit (24 hours by default), or has not synced while its user was on duty (OFF-11). | Follow the stale-device triage in `docs/RUNBOOK.md` §12. |
| `DIAGNOSTIC` | Someone tapped **Send diagnostics**. | Read the report (see §5) and contact them. |

**Resolving an item.** Click **Resolve** and write a short note saying what you did, for example
"Kept the office version of the hour meter (4 312 h); told Carlos." The note is kept with the
item, and the field user sees on their phone that the office has resolved it. If two people
resolve the same item at the same time, the second one gets `ALREADY_RESOLVED` with the first
person's note; nothing else is needed.

**Priorities.** Resolve `REJECTED_MUTATION` items for jobs that are in progress first, because the
technician may be waiting at the machine. Stale devices of people currently on duty come next.

## 5. Reading diagnostics

A diagnostics report is sent from the phone (Settings → Help, Sync center, or an error sheet) and
appears on `/team/devices` under that device, and as a `DIAGNOSTIC` item in `/attention`. It is
redacted: it never contains passwords, tokens, photo contents or the content of reports.

It shows:

- the app version, the phone model and operating system, battery level and battery-saver state,
  free storage and the clock difference with the server;
- the outbox: how many changes and uploads are waiting, the oldest one, and any that were
  refused, each with its error code and reference;
- the last errors with their codes and references;
- whether notifications and location permission are on.

How to use it:

1. **Clock wrong** (a large clock difference): ask the person to turn on automatic date and time.
   Many sync and sign-in errors disappear.
2. **Battery saver or app put to sleep:** send them the battery help page for their phone brand
   from the app (Settings → Help). Common on Xiaomi, Samsung and Motorola.
3. **Storage almost full:** ask them to free space; the app never deletes unsent photos by itself.
4. **Old app version:** ask them to update from the store; data is kept.
5. **Refused changes with a code:** look the code up in the table in §3.
6. **Error references:** search the server logs for them (operators only; see `docs/RUNBOOK.md`
   §13).

## 6. Team and invitations

These steps are done by an **administrator** of the customer company on **Team** (`/team`) and on
the person's page (`/team/[id]`). Managers can view the team but cannot change it.

### Inviting someone

1. **Team → Invite person.** Name, role (Admin, Manager or Field) and, optionally, email and
   phone. The email is not required: many field workers do not use one.
2. AgroRende shows an invitation with a **link**, a 10-character **code** and a **QR code**, and a
   **Send via WhatsApp** button that uses the phone number entered.
3. The invitation works **once** and is valid for **7 days**.
4. The person opens the link (`/i/<code>`) or types the code in the app under **I have an invite
   code**. They can join with **Google**, **Apple** or a **new password**. If an email was entered
   on the invitation, Google and Apple only accept that email.

**"My invitation doesn't work."**

- Expired or already used: on their page, **Resend invitation** creates a new code; the old one
  stops working.
- "This account isn't in a team yet" after signing in with Google or Apple: they signed in with
  an account that was not invited. Ask them to use the invite link or code first, which binds
  their Google or Apple account to the invitation.
- They joined with a different email from the one invited: the office gets a notification. If it
  was a mistake, deactivate the user and send a new invitation.

### Someone cannot sign in

AgroRende has no self-service "forgot password" e-mail. The office helps in one of three ways:

| Situation | Action on `/team/[id]` | What the person does |
|---|---|---|
| Forgot their password | **Create password link**. Send the link (`/r/<code>`) by WhatsApp or show the QR. It works once and expires. | Opens the link and sets a new password. |
| Cannot receive anything right now (for example, standing next to you) | **Set temporary password**. Tell them the password in person. | Signs in with it and must choose a new one immediately. |
| Lost access to the Google or Apple account they used | **Resend invitation**. | Joins with the new link using another Google or Apple account, or a password. Their history is kept. |
| A link says it has expired (`RESET_LINK_EXPIRED`) | Create a new password link. | Uses the newest link only. |

**The company's only administrator is locked out.** They cannot reset themselves. The customer
contacts AgroRende support; a staff member opens the organization on `/platform/orgs/[id]` and uses
**Sign-in link for the administrator**, entering a reason (for example "lost access to their
e-mail"). The link works once and expires. Confirm who you are
talking to (for example by calling back the company's registered office phone) before you
share it. The action is written to the platform audit log.

### Deactivating and reactivating

**Deactivate** signs the person out of every device, removes them from new assignments and keeps
all their history. For 72 hours, their phone can still send evidence it had already captured for
jobs, reports and rentals assigned to them, so nothing done in the field is lost; anything else
stays on the phone, and the app offers **Salvar cópia** (save a copy) and **Pedir ao escritório**
(ask the office). **Reactivate** restores access. The last administrator of a company cannot be
deactivated or demoted (`LAST_ADMIN`).

Changing someone's role takes effect at their next sync. Their phone downloads the data the new
role is allowed to see, and anything they had captured but not yet sent is kept and sent.

## 7. Account deletion

Anyone can delete their own account: in the app under **Settings**, and on the web under
**Account → Delete my account** (`/account`).

- **On the phone, deletion waits for unsent work.** If the outbox or the upload queue still has
  items, the app does not delete the account yet. It offers **Enviar agora** (send now) and
  **Salvar cópia** (save a copy to the phone's files), so the person's last work is not lost.
- **What is erased:** the person's name, email, phone, sign-in methods, devices and push tokens.
  They are signed out everywhere.
- **What is kept:** the company's records that the law or the business requires (completed jobs,
  rental contracts, signatures, costs), shown without the person's name.
- **Apple accounts:** AgroRende also revokes its access at Apple, in the background with retries.
  If someone signed up with Apple and never signed in again, Apple may still list AgroRende; they
  can remove it in their Apple ID settings under *Sign in with Apple*.
- **Administrators:** the last administrator of a company cannot delete their account until they
  make someone else an administrator (`LAST_ADMIN`).
- A deleted account cannot be restored. If the person returns, the company invites them again as a
  new person.

## 8. Organization status and subscription

Every customer company has a status that support may need to explain.

| Status | What the customer experiences | Support action |
|---|---|---|
| `TRIAL` | Everything works. A banner shows the days left. | Answer questions; staff may extend the trial on `/platform/orgs/[id]` with a reason. |
| `ACTIVE` | Everything works. | — |
| `PAST_DUE` | The trial ended or payment is late. Everything still works; administrators see a banner on `/settings/subscription`. After 14 days the company is suspended. | Remind the administrator to subscribe; staff can extend while it is sorted out. |
| `SUSPENDED` | The office web is read-only, but CSV exports still work. For 7 days phones keep sending field work; after that, sending answers `ORG_SUSPENDED` and work waits on the phones (nothing is lost). | Once the account is settled, staff change the status back to `ACTIVE` on `/platform/orgs/[id]`; phones send everything they kept. |
| `CANCELLED` | Same as suspended; the data is deleted 90 days after cancellation. | Until day 90, staff can reactivate. After the purge, the data is gone. |

Administrators of the customer see their plan, trial dates and usage on
`/settings/subscription`. AgroRende staff see every organization on `/platform/orgs`, and every
status, plan or trial change requires a reason that is kept in the audit log. Field users of a
blocked company see a message with the support WhatsApp number configured for the platform.
